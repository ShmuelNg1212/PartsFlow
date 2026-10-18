-- Pilot measurement (plan T6.1, spec "Pilot measurement"). Measured values only; the UI makes no claims from them.
--
-- Per posted document, one audit event "document.measured":
--   open_to_post_seconds  posted_at minus the first "document.opened" event (null when the draft was never opened in the app)
--   compared_fields       extracted fields compared: 4 header fields when extraction is done, and 6 fields per line that has raw values
--   corrected_fields      compared fields where the corrected value is not the raw value (null against a value counts)
--   suggested_lines       lines where the picker had a suggestion when the user picked a product
--   match_changes         of those, lines whose final product is not the suggested product
--   extracted_lines, lines_from_extraction, lines   lines in the result, lines still holding raw values, lines at posting
-- Decimals compare as numbers (17070.00 = 17070), as in the review hints (ExtractionBanner sameValue).

-- The top suggestion when the user picked the product. Written by the client through save_draft. Measurement only.
alter table public.document_lines add column suggested_product_id uuid;
alter table public.document_lines add constraint document_lines_suggested_product_fk
  foreign key (suggested_product_id, shop_id) references public.products (id, shop_id);
grant insert (suggested_product_id), update (suggested_product_id) on public.document_lines to authenticated;

create function public._same_value(p_raw text, p_current text) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  r text := nullif(btrim(p_raw), '');
  c text := nullif(btrim(p_current), '');
  v_num constant text := '^-?\d{1,15}(\.\d{1,6})?$';
begin
  if r is null or c is null then return r is null and c is null; end if;
  if r ~ v_num and c ~ v_num then return r::numeric = c::numeric; end if;
  return r = c;
end $$;

create function public.record_document_opened(p_document_id uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc record;
begin
  select d.shop_id, d.status into v_doc from public.documents d where d.id = p_document_id;
  if not found or not public.is_member(v_doc.shop_id) then
    raise exception 'Document not found, or you do not have access.' using errcode = '42501';
  end if;
  if v_doc.status <> 'draft' then return; end if;
  if exists (select 1 from public.audit_events where entity_id = p_document_id and kind = 'document.opened') then return; end if;
  perform public._audit(v_doc.shop_id, 'document.opened', 'document', p_document_id, '{}'::jsonb);
end $$;

-- Fires once, when post_document turns a draft into a posted document. A repeated post changes nothing.
create function public._measure_posted_document() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_opened timestamptz;
  v_lines integer;
  v_raw_lines integer;
  v_suggested integer;
  v_changes integer;
  v_compared integer := 0;
  v_corrected integer := 0;
  v_n integer;
  v_c integer;
begin
  select min(created_at) into v_opened from public.audit_events where entity_id = new.id and kind = 'document.opened';

  select count(*), count(*) filter (where raw is not null), count(*) filter (where suggested_product_id is not null),
         count(*) filter (where suggested_product_id is not null and product_id is distinct from suggested_product_id)
    into v_lines, v_raw_lines, v_suggested, v_changes
    from public.document_lines where document_id = new.id;

  select count(*), count(*) filter (where not public._same_value(f.raw_v, f.cur_v)) into v_n, v_c
    from public.document_lines l
    cross join lateral (values
      (l.raw#>>'{description,value}', l.description),
      (l.raw#>>'{part_number,value}', l.part_number),
      (l.raw#>>'{quantity,value}', l.quantity::text),
      (l.raw#>>'{unit,value}', l.unit),
      (l.raw#>>'{unit_price,value}', l.unit_price::text),
      (l.raw#>>'{discount,value}', l.discount::text)) as f(raw_v, cur_v)
   where l.document_id = new.id and l.raw is not null;
  v_compared := v_n;
  v_corrected := v_c;

  if new.extraction_status = 'done' then
    select count(*), count(*) filter (where not public._same_value(f.raw_v, f.cur_v)) into v_n, v_c
      from (values
        (new.raw_doc_number, new.doc_number),
        (new.raw_doc_date, new.doc_date::text),
        (lower(new.raw_counterparty), (select lower(c.name) from public.counterparties c where c.id = new.counterparty_id)),
        (new.raw_totals#>>'{total,value}', new.total_amount::text)) as f(raw_v, cur_v);
    v_compared := v_compared + v_n;
    v_corrected := v_corrected + v_c;
  end if;

  perform public._audit(new.shop_id, 'document.measured', 'document', new.id, jsonb_build_object(
    'direction', new.direction,
    'extraction_provider', new.extraction_provider,
    'extraction_status', new.extraction_status,
    'open_to_post_seconds', case when v_opened is not null then round(extract(epoch from new.posted_at - v_opened))::integer end,
    'lines', v_lines,
    'extracted_lines', case when new.extraction_status = 'done' then coalesce(jsonb_array_length(new.raw_extraction->'lines'), 0) else 0 end,
    'lines_from_extraction', v_raw_lines,
    'compared_fields', v_compared,
    'corrected_fields', v_corrected,
    'suggested_lines', v_suggested,
    'match_changes', v_changes));
  return null;
end $$;

create trigger documents_measure_posted after update of status on public.documents
for each row when (old.status = 'draft' and new.status = 'posted')
execute function public._measure_posted_document();

-- Owner CSV export of the measurement events. One row per measured document.
create function public.document_metrics(p_shop_id uuid)
returns table (
  document_id uuid,
  direction text,
  doc_number text,
  status text,
  posted_at timestamptz,
  demo_shop boolean,
  extraction_provider text,
  extraction_status text,
  open_to_post_seconds integer,
  lines integer,
  extracted_lines integer,
  lines_from_extraction integer,
  compared_fields integer,
  corrected_fields integer,
  suggested_lines integer,
  match_changes integer
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_owner(p_shop_id) then
    raise exception 'Only an owner of this shop can export pilot measurements.' using errcode = '42501';
  end if;
  return query
  select d.id, d.direction, d.doc_number, d.status, d.posted_at, s.is_demo,
         e.data->>'extraction_provider', e.data->>'extraction_status',
         (e.data->>'open_to_post_seconds')::integer,
         (e.data->>'lines')::integer, (e.data->>'extracted_lines')::integer, (e.data->>'lines_from_extraction')::integer,
         (e.data->>'compared_fields')::integer, (e.data->>'corrected_fields')::integer,
         (e.data->>'suggested_lines')::integer, (e.data->>'match_changes')::integer
    from public.audit_events e
    join public.documents d on d.id = e.entity_id
    join public.shops s on s.id = e.shop_id
   where e.shop_id = p_shop_id and e.kind = 'document.measured'
   order by d.posted_at, d.id;
end $$;

revoke execute on function public._same_value(text, text), public._measure_posted_document() from public, anon, authenticated;
revoke execute on function public.record_document_opened(uuid), public.document_metrics(uuid) from public, anon;
grant execute on function public.record_document_opened(uuid), public.document_metrics(uuid) to authenticated;

-- save_draft now also stores suggested_product_id. The rest is unchanged from 20261018070100_save_draft.sql.
create or replace function public.save_draft(
  p_document_id uuid,
  p_expected_updated_at timestamptz,
  p_header jsonb,
  p_lines jsonb
) returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_doc record;
  v_line jsonb;
  v_no integer := 0;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_qty_re constant text := '^\d{1,11}(\.\d{1,3})?$';
  v_money_re constant text := '^\d{1,12}(\.\d{1,2})?$';
  v_factor_re constant text := '^\d{1,8}(\.\d{1,6})?$';
  v_updated timestamptz;
begin
  -- Read first (select policy), so a posted document reports its status instead of "not found".
  select d.id, d.status into v_doc from public.documents d where d.id = p_document_id;
  if not found then
    raise exception 'Document not found, or you do not have access.' using errcode = '42501';
  end if;
  if v_doc.status <> 'draft' then
    raise exception 'This document is no longer a draft. Reload it.' using errcode = '55000';
  end if;
  -- Lock (update policy: drafts only) and re-read the version under the lock.
  select d.id, d.status, d.updated_at into v_doc from public.documents d where d.id = p_document_id for update;
  if not found then
    raise exception 'This document is no longer a draft. Reload it.' using errcode = '55000';
  end if;
  if p_expected_updated_at is distinct from v_doc.updated_at then
    raise exception 'Someone else saved this draft after you opened it. Reload it to see their changes.' using errcode = 'PF004';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Lines must be a list.' using errcode = '22023';
  end if;

  -- Validate every line before writing anything.
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no := v_no + 1;
    if nullif(v_line->>'quantity', '') is not null and (v_line->>'quantity') !~ v_qty_re then
      raise exception 'Line %: quantity must be a number with at most 3 decimals.', v_no using errcode = '22023';
    end if;
    if nullif(v_line->>'received_quantity', '') is not null and (v_line->>'received_quantity') !~ v_qty_re then
      raise exception 'Line %: received quantity must be a number with at most 3 decimals.', v_no using errcode = '22023';
    end if;
    if nullif(v_line->>'unit_price', '') is not null and (v_line->>'unit_price') !~ v_money_re then
      raise exception 'Line %: price must be a number with at most 2 decimals.', v_no using errcode = '22023';
    end if;
    if nullif(v_line->>'discount', '') is not null and (v_line->>'discount') !~ v_money_re then
      raise exception 'Line %: discount must be a number with at most 2 decimals.', v_no using errcode = '22023';
    end if;
    if nullif(v_line->>'conversion_factor', '') is not null
       and ((v_line->>'conversion_factor') !~ v_factor_re or (v_line->>'conversion_factor')::numeric = 0) then
      raise exception 'Line %: conversion factor must be a number above zero.', v_no using errcode = '22023';
    end if;
    if nullif(v_line->>'id', '') is not null and not exists (
      select 1 from public.document_lines l where l.id = (v_line->>'id')::uuid and l.document_id = p_document_id) then
      raise exception 'Line % does not belong to this document. Reload it.', v_no using errcode = '22023';
    end if;
  end loop;

  if p_header is not null and p_header <> '{}'::jsonb then
    update public.documents set
      doc_number = case when p_header ? 'doc_number' then nullif(btrim(p_header->>'doc_number'), '') else doc_number end,
      doc_date = case when p_header ? 'doc_date' then nullif(p_header->>'doc_date', '')::date else doc_date end,
      counterparty_id = case when p_header ? 'counterparty_id' then nullif(p_header->>'counterparty_id', '')::uuid else counterparty_id end,
      total_amount = case when p_header ? 'total_amount' then nullif(p_header->>'total_amount', '')::numeric else total_amount end,
      notes = case when p_header ? 'notes' then nullif(p_header->>'notes', '') else notes end,
      direction = case when p_header ? 'direction' then p_header->>'direction' else direction end
    where id = p_document_id;
  else
    -- Touch the row so the next save sees a new version.
    update public.documents set notes = notes where id = p_document_id;
  end if;

  -- Move current line numbers out of the way, so renumbering cannot hit the (document_id, line_no) unique key.
  update public.document_lines set line_no = line_no + 1000000 where document_id = p_document_id;

  v_no := 0;
  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_no := v_no + 1;
    v_id := nullif(v_line->>'id', '')::uuid;
    if v_id is null then
      insert into public.document_lines (document_id, line_no, description, part_number, quantity, unit, unit_price,
                                         discount, received_quantity, conversion_factor, product_id, match_source,
                                         suggested_product_id)
      values (p_document_id, v_no,
              nullif(v_line->>'description', ''), nullif(v_line->>'part_number', ''),
              nullif(v_line->>'quantity', '')::numeric, nullif(v_line->>'unit', ''),
              nullif(v_line->>'unit_price', '')::numeric, nullif(v_line->>'discount', '')::numeric,
              nullif(v_line->>'received_quantity', '')::numeric, nullif(v_line->>'conversion_factor', '')::numeric,
              nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'match_source', ''),
              nullif(v_line->>'suggested_product_id', '')::uuid)
      returning id into v_id;
    else
      update public.document_lines set
        line_no = v_no,
        description = nullif(v_line->>'description', ''),
        part_number = nullif(v_line->>'part_number', ''),
        quantity = nullif(v_line->>'quantity', '')::numeric,
        unit = nullif(v_line->>'unit', ''),
        unit_price = nullif(v_line->>'unit_price', '')::numeric,
        discount = nullif(v_line->>'discount', '')::numeric,
        received_quantity = nullif(v_line->>'received_quantity', '')::numeric,
        conversion_factor = nullif(v_line->>'conversion_factor', '')::numeric,
        product_id = nullif(v_line->>'product_id', '')::uuid,
        match_source = nullif(v_line->>'match_source', ''),
        suggested_product_id = nullif(v_line->>'suggested_product_id', '')::uuid
      where id = v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.document_lines where document_id = p_document_id and not (id = any (v_keep));

  select updated_at into v_updated from public.documents where id = p_document_id;
  return jsonb_build_object('updated_at', v_updated, 'line_ids', to_jsonb(v_keep));
end $$;

