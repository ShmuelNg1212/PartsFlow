-- post_document (plan T1.3, ADR 0001). The only path that turns a draft into stock movements.
-- Rules: R-POST-3..9, R-POST-11, R-DOC-6, R-DOC-8, R-ROLE-1, R-DATA-1, R-DATA-2, R-DATA-7, R-DATA-8.
--
-- Error codes for the client:
--   42501  not permitted
--   PF001  insufficient stock (detail: json array of {product_id, sku, description, on_hand, requested})
--   PF002  likely duplicate (detail: json array of {document_id, doc_number, reason})
--   PF003  a line is not ready to post (message names the line)
--   55000  document is not a draft

create function public.post_document(
  p_document_id uuid,
  p_idempotency_key uuid,
  p_duplicate_override_reason text default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
  v_line record;
  v_sign integer;
  v_override text := nullif(btrim(coalesce(p_duplicate_override_reason, '')), '');
  v_dups jsonb;
  v_short jsonb;
  v_first jsonb;
  v_count integer;
begin
  -- 1. Permission (R-ROLE-1). Look up the shop without a lock first, so a non-owner never waits on a lock.
  select * into v_doc from public.documents where id = p_document_id;
  if not found or not public.is_owner(v_doc.shop_id) then
    raise exception 'Only an owner of this shop can post documents.' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  -- 2. Lock the document row. Concurrent posts of the same document wait here (R-POST-6).
  select * into v_doc from public.documents where id = p_document_id for update;
  if v_doc.status = 'posted' then
    return jsonb_build_object(
      'document_id', v_doc.id, 'status', v_doc.status, 'posted_at', v_doc.posted_at,
      'already_posted', true, 'same_request', v_doc.idempotency_key = p_idempotency_key);
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'This document was reversed. It cannot be posted again.' using errcode = '55000';
  end if;
  v_sign := case v_doc.direction when 'receipt' then 1 else -1 end;

  -- 3. Validate lines and compute base-unit quantities.
  create temp table if not exists _post_lines (
    line_id uuid, line_no integer, product_id uuid, base_qty numeric(14, 3),
    description_norm text, part_number_norm text
  ) on commit drop;
  truncate _post_lines;

  select count(*) into v_count from public.document_lines where document_id = v_doc.id;
  if v_count = 0 then
    raise exception 'This document has no lines.' using errcode = 'PF003';
  end if;

  for v_line in
    select l.*, p.base_unit as product_base_unit
    from public.document_lines l
    left join public.products p on p.id = l.product_id
    where l.document_id = v_doc.id
    order by l.line_no
  loop
    if v_line.product_id is null then
      raise exception 'Line % has no confirmed product. Select a product before posting.', v_line.line_no using errcode = 'PF003';
    end if;
    declare
      v_qty numeric := case v_doc.direction when 'receipt' then v_line.received_quantity else v_line.quantity end;
      v_factor numeric;
    begin
      if v_doc.direction = 'receipt' and v_line.received_quantity is null then
        raise exception 'Line %: confirm the received quantity before posting.', v_line.line_no using errcode = 'PF003';
      end if;
      if v_qty is null or v_qty < 0 or (v_doc.direction = 'sale' and v_qty = 0) then
        raise exception 'Line %: quantity must be more than zero.', v_line.line_no using errcode = 'PF003';
      end if;
      if v_line.unit is null or btrim(v_line.unit) = '' or lower(btrim(v_line.unit)) = lower(btrim(v_line.product_base_unit)) then
        v_factor := 1;
      elsif v_line.conversion_factor is null then
        raise exception 'Line %: unit "%" differs from the product unit "%". Enter a conversion factor.',
          v_line.line_no, v_line.unit, v_line.product_base_unit using errcode = 'PF003';
      else
        v_factor := v_line.conversion_factor;
      end if;
      insert into _post_lines values (
        v_line.id, v_line.line_no, v_line.product_id, round(v_qty * v_factor, 3),
        public.normalize_description(v_line.description), public.normalize_part_number(v_line.part_number));
    end;
  end loop;

  -- 4. Duplicates (R-POST-9). Reversed documents do not count: a correction re-posts the same invoice.
  select coalesce(jsonb_agg(d), '[]'::jsonb) into v_dups from (
    select o.id as document_id, o.doc_number, 'same number, counterparty, and direction' as reason
    from public.documents o
    where o.shop_id = v_doc.shop_id and o.id <> v_doc.id and o.status = 'posted'
      and o.direction = v_doc.direction
      and v_doc.doc_number is not null and btrim(v_doc.doc_number) <> ''
      and o.counterparty_id is not distinct from v_doc.counterparty_id
      and lower(btrim(o.doc_number)) = lower(btrim(v_doc.doc_number))
    union all
    select o.id, o.doc_number, 'same file'
    from public.documents o
    where o.shop_id = v_doc.shop_id and o.id <> v_doc.id and o.status = 'posted'
      and v_doc.file_sha256 is not null and o.file_sha256 = v_doc.file_sha256
  ) d;
  if jsonb_array_length(v_dups) > 0 then
    if v_override is null then
      v_first := v_dups->0;
      raise exception 'Likely duplicate: a posted document has the %. Review it. An owner can post anyway with a reason.',
        v_first->>'reason' using errcode = 'PF002', detail = v_dups::text;
    end if;
    perform public._audit(v_doc.shop_id, 'document.duplicate_override', 'document', v_doc.id,
      jsonb_build_object('reason', v_override, 'duplicates', v_dups));
  end if;

  -- 5. Lock balances in product order (no deadlocks), then check stock for sales (R-POST-7, R-POST-8).
  perform 1 from public.product_balances b
  where b.product_id in (select product_id from _post_lines)
  order by b.product_id
  for update;

  if v_doc.direction = 'sale' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'product_id', s.product_id, 'sku', p.sku, 'description', p.description,
             'on_hand', trim_scale(b.qty)::text, 'requested', trim_scale(s.qty)::text) order by p.sku), '[]'::jsonb)
      into v_short
    from (select product_id, sum(base_qty) as qty from _post_lines group by product_id) s
    join public.product_balances b on b.product_id = s.product_id
    join public.products p on p.id = s.product_id
    where b.qty < s.qty;
    if jsonb_array_length(v_short) > 0 then
      v_first := v_short->0;
      raise exception 'Not enough stock for % (%): on hand %, requested %.',
        v_first->>'description', v_first->>'sku', v_first->>'on_hand', v_first->>'requested'
        using errcode = 'PF001', detail = v_short::text;
    end if;
  end if;

  -- 6. Write movements, balances, status, aliases, and audit in this one transaction (R-POST-5).
  for v_line in select * from _post_lines where base_qty <> 0 order by line_no loop
    perform public._ledger_add(v_doc.shop_id, v_line.product_id, v_sign * v_line.base_qty, 'document_line',
      auth.uid(), v_doc.id, v_line.line_id);
  end loop;

  if v_doc.direction = 'receipt' and v_doc.counterparty_id is not null then
    insert into public.supplier_aliases (shop_id, counterparty_id, description_norm, part_number_norm, product_id, last_confirmed_by)
    select distinct on (l.description_norm) v_doc.shop_id, v_doc.counterparty_id, l.description_norm, l.part_number_norm, l.product_id, auth.uid()
    from _post_lines l where l.description_norm is not null
    order by l.description_norm, l.line_no
    on conflict (shop_id, counterparty_id, description_norm) do update
      set product_id = excluded.product_id,
          part_number_norm = excluded.part_number_norm,
          confirmed_count = case when public.supplier_aliases.product_id = excluded.product_id
                                 then public.supplier_aliases.confirmed_count + 1 else 1 end,
          last_confirmed_at = now(),
          last_confirmed_by = excluded.last_confirmed_by;
  end if;

  perform set_config('partsflow.ledger_write', 'on', true);
  update public.documents
     set status = 'posted', posted_at = now(), posted_by = auth.uid(),
         idempotency_key = p_idempotency_key, duplicate_override_reason = v_override
   where id = v_doc.id
  returning * into v_doc;
  perform set_config('partsflow.ledger_write', '', true);

  perform public._audit(v_doc.shop_id, 'document.posted', 'document', v_doc.id,
    jsonb_build_object('direction', v_doc.direction, 'idempotency_key', p_idempotency_key,
      'movements', (select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', (v_sign * base_qty)::text)) from _post_lines)));

  return jsonb_build_object(
    'document_id', v_doc.id, 'status', v_doc.status, 'posted_at', v_doc.posted_at,
    'already_posted', false, 'same_request', true);
end $$;

revoke execute on function public.post_document(uuid, uuid, text) from public, anon;
grant execute on function public.post_document(uuid, uuid, text) to authenticated;
