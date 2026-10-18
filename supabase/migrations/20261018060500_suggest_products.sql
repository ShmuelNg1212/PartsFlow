-- Product match suggestions (plan T1.6). Rules: R-DOC-6, R-DOC-8, R-PROD-5.
-- Order: confirmed supplier alias, exact normalized part number, then description similarity.
-- "confident" is true for one row only when exactly one product comes from the strong sources
-- (alias, or exact part number with the same brand) and no other product matches the part number.
-- Every other case is ambiguous: the user selects the product.

create function public.suggest_products(
  p_shop_id uuid,
  p_counterparty_id uuid,
  p_description text,
  p_part_number text,
  p_brand text default null
) returns table (
  product_id uuid,
  sku text,
  part_number text,
  description text,
  brand text,
  base_unit text,
  source text,
  score real,
  confident boolean
)
language plpgsql stable security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_desc text := public.normalize_description(p_description);
  v_pn text := public.normalize_part_number(p_part_number);
  v_brand text := nullif(lower(btrim(coalesce(p_brand, ''))), '');
begin
  if not public.is_member(p_shop_id) then
    raise exception 'Not a member of this shop.' using errcode = '42501';
  end if;

  return query
  with alias as (
    select a.product_id, 'alias'::text as source, 1.0::real as score, true as strong
    from public.supplier_aliases a
    where a.shop_id = p_shop_id and p_counterparty_id is not null and a.counterparty_id = p_counterparty_id
      and v_desc is not null and a.description_norm = v_desc
  ),
  pn as (
    select p.id as product_id, 'part_number'::text as source, 0.9::real as score,
           (v_brand is not null and lower(p.brand) = v_brand) as strong
    from public.products p
    where p.shop_id = p_shop_id and v_pn is not null and p.part_number_norm = v_pn
  ),
  descr as (
    select p.id as product_id, 'description'::text as source,
           extensions.similarity(p.description, p_description)::real as score, false as strong
    from public.products p
    where p.shop_id = p_shop_id and v_desc is not null
      and extensions.similarity(p.description, p_description) > 0.3
    order by 3 desc
    limit 5
  ),
  all_rows as (
    select * from alias union all select * from pn union all select * from descr
  ),
  best as (
    -- One row per product: its strongest source.
    select distinct on (r.product_id) r.product_id, r.source, r.score, r.strong
    from all_rows r
    order by r.product_id, case r.source when 'alias' then 0 when 'part_number' then 1 else 2 end, r.score desc
  ),
  verdict as (
    select (select count(distinct x.product_id) from all_rows x where x.source in ('alias', 'part_number')) = 1
       and (select count(*) from best b where b.strong) = 1 as is_confident
  )
  select b.product_id, p.sku, p.part_number, p.description, p.brand, p.base_unit, b.source, b.score,
         (b.strong and v.is_confident) as confident
  from best b
  join public.products p on p.id = b.product_id
  cross join verdict v
  order by case b.source when 'alias' then 0 when 'part_number' then 1 else 2 end, b.score desc, p.sku
  limit 10;
end $$;

revoke execute on function public.suggest_products(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.suggest_products(uuid, uuid, text, text, text) to authenticated;
