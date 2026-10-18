-- Product list with balance and low-stock state, and product search (plan T2.2).
-- Rules: R-PROD-4, R-STOCK-1, D3. Quantities and money are text so the browser never rounds them (R-DATA-3).

create view public.product_stock with (security_invoker = true) as
select p.id, p.shop_id, p.sku, p.part_number, p.description, p.brand, p.base_unit,
       p.selling_price::text as selling_price,
       trim_scale(p.reorder_threshold)::text as reorder_threshold,
       p.shelf_bin,
       trim_scale(coalesce(b.qty, 0))::text as qty,
       coalesce(b.qty, 0) <= p.reorder_threshold as is_low,
       exists (select 1 from public.stock_movements m where m.product_id = p.id) as has_movements,
       p.updated_at
from public.products p
left join public.product_balances b on b.product_id = p.id;

grant select on public.product_stock to authenticated;

-- Matches SKU, part number (normalized), description, brand, and confirmed supplier aliases.
create function public.search_products(p_shop_id uuid, p_query text)
returns setof public.product_stock
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_like text := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_pn text := public.normalize_part_number(v_q);
  v_desc text := public.normalize_description(v_q);
begin
  if not public.is_member(p_shop_id) then
    raise exception 'Not a member of this shop.' using errcode = '42501';
  end if;
  return query
  select s.* from public.product_stock s
  where s.shop_id = p_shop_id
    and (
      v_q = ''
      or s.sku ilike v_like
      or s.description ilike v_like
      or s.brand ilike v_like
      or s.part_number ilike v_like
      or (v_pn is not null and public.normalize_part_number(s.part_number) like '%' || v_pn || '%')
      or exists (select 1 from public.supplier_aliases a
                 where a.product_id = s.id and v_desc is not null and a.description_norm like '%' || v_desc || '%')
    )
  order by s.sku
  limit 500;
end $$;

revoke execute on function public.search_products(uuid, text) from public, anon;
grant execute on function public.search_products(uuid, text) to authenticated;
