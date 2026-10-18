-- save_draft (plan T2.3). One transaction per draft save. Rules: R-DOC-4, R-DOC-10, R-POST-1, R-DATA-4.
-- Security invoker: grants and RLS apply as for direct writes. Raw extracted columns are never touched.
--
-- Error codes: 42501 not permitted, 55000 not a draft, PF004 someone else saved first, 22023 invalid value.

create function public.save_draft(
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
                                         discount, received_quantity, conversion_factor, product_id, match_source)
      values (p_document_id, v_no,
              nullif(v_line->>'description', ''), nullif(v_line->>'part_number', ''),
              nullif(v_line->>'quantity', '')::numeric, nullif(v_line->>'unit', ''),
              nullif(v_line->>'unit_price', '')::numeric, nullif(v_line->>'discount', '')::numeric,
              nullif(v_line->>'received_quantity', '')::numeric, nullif(v_line->>'conversion_factor', '')::numeric,
              nullif(v_line->>'product_id', '')::uuid, nullif(v_line->>'match_source', ''))
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
        match_source = nullif(v_line->>'match_source', '')
      where id = v_id;
    end if;
    v_keep := v_keep || v_id;
  end loop;

  delete from public.document_lines where document_id = p_document_id and not (id = any (v_keep));

  select updated_at into v_updated from public.documents where id = p_document_id;
  return jsonb_build_object('updated_at', v_updated, 'line_ids', to_jsonb(v_keep));
end $$;

revoke execute on function public.save_draft(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_draft(uuid, timestamptz, jsonb, jsonb) to authenticated;
