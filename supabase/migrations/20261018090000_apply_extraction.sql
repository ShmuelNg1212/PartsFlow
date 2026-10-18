-- apply_extraction (plan T4.3, ADR 0002). Called only by the extract-document Edge Function (service role).
-- Rules: R-DOC-4 (raw apart from corrected), R-DOC-5, R-EXT-3 (untrusted, never stock), R-POST-1, R-POST-3, R-POST-9 (file hash).
--
-- Corrected values are pre-filled only when empty and only with clean values. Received quantity is never pre-filled.
-- Lines are added only when the draft has no lines, so a user's typing is never replaced.

create function public.apply_extraction(p_document_id uuid, p_sha256 text, p_result jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
  v_status text := coalesce(p_result->>'status', 'failed');
  v_party text;
  v_party_id uuid;
  v_line jsonb;
  v_no integer := 0;
  v_added integer := 0;
  v_qty_re constant text := '^\d{1,11}(\.\d{1,3})?$';
  v_money_re constant text := '^\d{1,12}(\.\d{1,2})?$';
begin
  if p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A SHA-256 hex digest is required.' using errcode = '22023';
  end if;
  if v_status not in ('done', 'not_available', 'failed') then
    raise exception 'Unknown extraction status.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_result->'lines', '[]'::jsonb)) > 500 then
    raise exception 'Too many lines in the extraction result.' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found.' using errcode = '22023';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'Only a draft can receive extraction results.' using errcode = '55000';
  end if;

  v_party := nullif(btrim(case v_doc.direction when 'receipt' then p_result#>>'{vendor_name,value}' else p_result#>>'{customer_name,value}' end), '');
  if v_party is not null and v_doc.counterparty_id is null then
    select c.id into v_party_id from public.counterparties c
    where c.shop_id = v_doc.shop_id and c.kind = case v_doc.direction when 'receipt' then 'supplier' else 'customer' end
      and lower(btrim(c.name)) = lower(v_party)
    limit 1;
  end if;

  update public.documents set
    file_sha256 = p_sha256,
    extraction_provider = left(coalesce(p_result->>'provider', 'unknown'), 40),
    extraction_status = v_status,
    raw_extraction = p_result,
    raw_doc_number = p_result#>>'{doc_number,value}',
    raw_doc_date = p_result#>>'{doc_date,value}',
    raw_counterparty = v_party,
    raw_totals = p_result->'totals',
    doc_number = coalesce(doc_number, left(nullif(btrim(p_result#>>'{doc_number,value}'), ''), 80)),
    doc_date = coalesce(doc_date, case when p_result#>>'{doc_date,value}' ~ '^\d{4}-\d{2}-\d{2}$'
                                       then (p_result#>>'{doc_date,value}')::date end),
    total_amount = coalesce(total_amount, case when p_result#>>'{totals,total,value}' ~ v_money_re
                                               then (p_result#>>'{totals,total,value}')::numeric end),
    counterparty_id = coalesce(counterparty_id, v_party_id)
  where id = p_document_id;

  if v_status = 'done' and not exists (select 1 from public.document_lines where document_id = p_document_id) then
    for v_line in select value from jsonb_array_elements(coalesce(p_result->'lines', '[]'::jsonb)) loop
      v_no := v_no + 1;
      insert into public.document_lines (document_id, line_no, description, part_number, quantity, unit, unit_price, discount, raw)
      values (
        p_document_id, v_no,
        left(nullif(btrim(v_line#>>'{description,value}'), ''), 300),
        left(nullif(btrim(v_line#>>'{part_number,value}'), ''), 64),
        case when v_line#>>'{quantity,value}' ~ v_qty_re then (v_line#>>'{quantity,value}')::numeric end,
        left(nullif(btrim(v_line#>>'{unit,value}'), ''), 20),
        case when v_line#>>'{unit_price,value}' ~ v_money_re then (v_line#>>'{unit_price,value}')::numeric end,
        case when v_line#>>'{discount,value}' ~ v_money_re then (v_line#>>'{discount,value}')::numeric end,
        v_line
      );
      v_added := v_added + 1;
    end loop;
  end if;

  perform public._audit(v_doc.shop_id, 'document.extracted', 'document', p_document_id,
    jsonb_build_object('provider', p_result->>'provider', 'status', v_status, 'lines_added', v_added));
  return jsonb_build_object('status', v_status, 'lines_added', v_added);
end $$;

revoke execute on function public.apply_extraction(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_extraction(uuid, text, jsonb) to service_role;
