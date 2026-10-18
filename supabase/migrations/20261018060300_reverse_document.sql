-- reverse_document (plan T1.4). Rules: R-POST-10, D4 (whole document), D5 (no negative balance), R-ROLE-1, R-DATA-8.

create function public.reverse_document(p_document_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc public.documents%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_short jsonb;
  v_first jsonb;
  v_mv record;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if not found or not public.is_owner(v_doc.shop_id) then
    raise exception 'Only an owner of this shop can reverse documents.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A reversal needs a reason.' using errcode = '22023';
  end if;

  select * into v_doc from public.documents where id = p_document_id for update;
  if v_doc.status = 'reversed' then
    raise exception 'This document is already reversed.' using errcode = '55000';
  end if;
  if v_doc.status <> 'posted' then
    raise exception 'Only a posted document can be reversed. Edit or delete the draft instead.' using errcode = '55000';
  end if;

  -- Lock the affected balances in product order, then check that no balance goes negative (D5).
  perform 1 from public.product_balances b
  where b.product_id in (select product_id from public.stock_movements where document_id = v_doc.id and source = 'document_line')
  order by b.product_id
  for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', s.product_id, 'sku', p.sku, 'description', p.description,
           'on_hand', trim_scale(b.qty)::text, 'requested', trim_scale(-s.delta)::text) order by p.sku), '[]'::jsonb)
    into v_short
  from (
    select product_id, -sum(qty) as delta
    from public.stock_movements
    where document_id = v_doc.id and source = 'document_line'
    group by product_id
  ) s
  join public.product_balances b on b.product_id = s.product_id
  join public.products p on p.id = s.product_id
  where b.qty + s.delta < 0;
  if jsonb_array_length(v_short) > 0 then
    v_first := v_short->0;
    raise exception 'Cannot reverse: not enough stock for % (%): on hand %, requested %.',
      v_first->>'description', v_first->>'sku', v_first->>'on_hand', v_first->>'requested'
      using errcode = 'PF001', detail = v_short::text;
  end if;

  for v_mv in
    select * from public.stock_movements where document_id = v_doc.id and source = 'document_line' order by created_at, id
  loop
    perform public._ledger_add(v_doc.shop_id, v_mv.product_id, -v_mv.qty, 'reversal', auth.uid(),
      v_doc.id, v_mv.document_line_id, v_mv.id, v_reason);
  end loop;

  perform set_config('partsflow.ledger_write', 'on', true);
  update public.documents
     set status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
   where id = v_doc.id
  returning * into v_doc;
  perform set_config('partsflow.ledger_write', '', true);

  perform public._audit(v_doc.shop_id, 'document.reversed', 'document', v_doc.id, jsonb_build_object('reason', v_reason));

  return jsonb_build_object('document_id', v_doc.id, 'status', v_doc.status, 'reversed_at', v_doc.reversed_at);
end $$;

revoke execute on function public.reverse_document(uuid, text) from public, anon;
grant execute on function public.reverse_document(uuid, text) to authenticated;
