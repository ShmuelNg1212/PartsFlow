-- Opening quantities and product import (plan T1.2). Rules: R-PROD-2, R-PROD-3, R-DATA-1, R-DATA-2, R-DATA-8.

-- Every product has a balance row from creation, so the posting function can lock it.
create function public.create_product_balance() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.product_balances (product_id, shop_id, qty) values (new.id, new.shop_id, 0);
  return new;
end $$;

create trigger products_create_balance after insert on public.products
for each row execute function public.create_product_balance();

-- Internal: append one movement and update the cached balance in the same transaction (R-DATA-2).
-- The caller must hold the balance row lock when the change can make the balance negative.
-- Not executable by clients.
create function public._ledger_add(
  p_shop uuid,
  p_product uuid,
  p_qty numeric,
  p_source text,
  p_actor uuid,
  p_document uuid default null,
  p_line uuid default null,
  p_reverses uuid default null,
  p_reason text default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prev text := coalesce(current_setting('partsflow.ledger_write', true), '');
begin
  perform set_config('partsflow.ledger_write', 'on', true);
  insert into public.stock_movements (shop_id, product_id, qty, source, document_id, document_line_id, reverses_movement_id, reason, actor)
  values (p_shop, p_product, p_qty, p_source, p_document, p_line, p_reverses, p_reason, p_actor)
  returning id into v_id;
  update public.product_balances set qty = qty + p_qty, updated_at = now() where product_id = p_product;
  if not found then
    raise exception 'Product % has no balance row.', p_product;
  end if;
  perform set_config('partsflow.ledger_write', v_prev, true);
  return v_id;
end $$;

create function public._audit(p_shop uuid, p_kind text, p_entity text, p_entity_id uuid, p_data jsonb default '{}'::jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_events (shop_id, actor, kind, entity, entity_id, data)
  values (p_shop, auth.uid(), p_kind, p_entity, p_entity_id, coalesce(p_data, '{}'::jsonb))
$$;

-- R-PROD-3: opening quantity is a movement with source 'opening', allowed only before any other movement.
create function public.set_opening_quantity(p_product_id uuid, p_qty numeric)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from public.products where id = p_product_id;
  if v_shop is null or not public.is_owner(v_shop) then
    raise exception 'Only an owner of this shop can set an opening quantity.' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 0 then
    raise exception 'Opening quantity must be zero or more.' using errcode = '22023';
  end if;
  -- Lock the balance row so a concurrent post cannot slip in between the check and the write.
  perform 1 from public.product_balances where product_id = p_product_id for update;
  if exists (select 1 from public.stock_movements where product_id = p_product_id) then
    raise exception 'This product already has stock movements. Record a receipt or a sale instead.' using errcode = '55000';
  end if;
  if p_qty > 0 then
    perform public._ledger_add(v_shop, p_product_id, round(p_qty, 3), 'opening', auth.uid());
  end if;
  perform public._audit(v_shop, 'stock.opening', 'product', p_product_id, jsonb_build_object('qty', round(p_qty, 3)::text));
end $$;

-- R-PROD-2: the client shows a preview first. The server validates every row again and writes all or nothing.
-- Each row: sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, opening_qty.
create function public.import_products(p_shop_id uuid, p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_row_errors text[];
  v_num_re constant text := '^\s*\d+(\.\d+)?\s*$';
  v_seen_sku text[] := '{}';
  v_seen_key text[] := '{}';
  v_key text;
  v_product uuid;
  v_inserted integer := 0;
begin
  if not public.is_owner(p_shop_id) then
    raise exception 'Only an owner of this shop can import products.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The import has no rows.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'The import has more than 5000 rows. Split the file.' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_row_errors := '{}';
    if coalesce(btrim(v_row->>'sku'), '') = '' then v_row_errors := array_append(v_row_errors, 'SKU is required'); end if;
    if coalesce(btrim(v_row->>'part_number'), '') = '' then v_row_errors := array_append(v_row_errors, 'Part number is required'); end if;
    if coalesce(btrim(v_row->>'description'), '') = '' then v_row_errors := array_append(v_row_errors, 'Description is required'); end if;
    if coalesce(btrim(v_row->>'brand'), '') = '' then v_row_errors := array_append(v_row_errors, 'Brand is required'); end if;
    if coalesce(btrim(v_row->>'base_unit'), '') = '' then v_row_errors := array_append(v_row_errors, 'Base unit is required'); end if;
    if coalesce(v_row->>'selling_price', '0') !~ v_num_re then v_row_errors := array_append(v_row_errors, 'Selling price must be a number, zero or more'); end if;
    if coalesce(v_row->>'reorder_threshold', '0') !~ v_num_re then v_row_errors := array_append(v_row_errors, 'Reorder threshold must be a number, zero or more'); end if;
    if coalesce(v_row->>'opening_qty', '0') !~ v_num_re then v_row_errors := array_append(v_row_errors, 'Opening quantity must be a number, zero or more'); end if;

    if coalesce(btrim(v_row->>'sku'), '') <> '' then
      if lower(btrim(v_row->>'sku')) = any (v_seen_sku) then
        v_row_errors := array_append(v_row_errors, 'SKU appears twice in the file');
      elsif exists (select 1 from public.products p where p.shop_id = p_shop_id and p.sku = btrim(v_row->>'sku')) then
        v_row_errors := array_append(v_row_errors, 'SKU already exists');
      end if;
      v_seen_sku := v_seen_sku || lower(btrim(v_row->>'sku'));
    end if;

    v_key := lower(btrim(coalesce(v_row->>'brand', ''))) || '|' || coalesce(public.normalize_part_number(v_row->>'part_number'), '');
    if v_key = any (v_seen_key) then
      v_row_errors := array_append(v_row_errors, 'Same brand and part number appear twice in the file');
    elsif exists (select 1 from public.products p where p.shop_id = p_shop_id
                  and lower(p.brand) = lower(btrim(v_row->>'brand'))
                  and p.part_number_norm = public.normalize_part_number(v_row->>'part_number')) then
      v_row_errors := array_append(v_row_errors, 'A product with this brand and part number already exists');
    end if;
    v_seen_key := v_seen_key || v_key;

    if cardinality(v_row_errors) > 0 then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'errors', to_jsonb(v_row_errors));
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception '% % invalid. Nothing was imported.',
      jsonb_array_length(v_errors), case when jsonb_array_length(v_errors) = 1 then 'row is' else 'rows are' end
      using errcode = '22023', detail = v_errors::text;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into public.products (shop_id, sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, created_by)
    values (
      p_shop_id,
      btrim(v_row->>'sku'),
      btrim(v_row->>'part_number'),
      btrim(v_row->>'description'),
      btrim(v_row->>'brand'),
      btrim(v_row->>'base_unit'),
      coalesce(nullif(btrim(v_row->>'selling_price'), ''), '0')::numeric(14, 2),
      coalesce(nullif(btrim(v_row->>'reorder_threshold'), ''), '0')::numeric(14, 3),
      nullif(btrim(coalesce(v_row->>'shelf_bin', '')), ''),
      auth.uid()
    )
    returning id into v_product;
    if coalesce(nullif(btrim(v_row->>'opening_qty'), ''), '0')::numeric > 0 then
      perform public._ledger_add(p_shop_id, v_product, round(btrim(v_row->>'opening_qty')::numeric, 3), 'opening', auth.uid());
    end if;
    v_inserted := v_inserted + 1;
  end loop;

  perform public._audit(p_shop_id, 'product.imported', 'shop', p_shop_id, jsonb_build_object('rows', v_inserted));
  return jsonb_build_object('inserted', v_inserted);
end $$;

revoke execute on function public.create_product_balance(), public._ledger_add(uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, text),
  public._audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.set_opening_quantity(uuid, numeric), public.import_products(uuid, jsonb) from public, anon;
grant execute on function public.set_opening_quantity(uuid, numeric), public.import_products(uuid, jsonb) to authenticated;
