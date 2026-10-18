-- Overview sales total, members list, and invite lookup (plan T3.1, T3.2). Rules: spec Overview, R-ROLE-2, D1.

-- "Recorded sales" for one shop day: posted (not reversed) sales, quantity × price − discount.
-- It is not cash received or profit. Lines without a price are counted, not guessed.
create function public.recorded_sales(p_shop_id uuid, p_day date)
returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_shop record;
  v_from timestamptz;
  v_to timestamptz;
  v_result jsonb;
begin
  if not public.is_member(p_shop_id) then
    raise exception 'Not a member of this shop.' using errcode = '42501';
  end if;
  select currency, timezone into v_shop from public.shops where id = p_shop_id;
  v_from := (p_day::timestamp) at time zone v_shop.timezone;
  v_to := ((p_day + 1)::timestamp) at time zone v_shop.timezone;

  select jsonb_build_object(
    'day', p_day::text,
    'currency', v_shop.currency,
    'total', to_char(coalesce(sum(round(coalesce(l.quantity, 0) * coalesce(l.unit_price, 0) - coalesce(l.discount, 0), 2)), 0), 'FM999999999990.00'),
    'documents', count(distinct d.id),
    'lines_without_price', count(*) filter (where l.id is not null and l.unit_price is null)
  ) into v_result
  from public.documents d
  left join public.document_lines l on l.document_id = d.id
  where d.shop_id = p_shop_id and d.direction = 'sale' and d.status = 'posted'
    and d.posted_at >= v_from and d.posted_at < v_to;
  return v_result;
end $$;

revoke execute on function public.recorded_sales(uuid, date) from public, anon;
grant execute on function public.recorded_sales(uuid, date) to authenticated;

-- Members of a shop the caller belongs to, with email (auth.users is not readable by clients).
create function public.list_members(p_shop_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_shop_id) then
    raise exception 'Not a member of this shop.' using errcode = '42501';
  end if;
  return query
  select m.user_id, u.email::text, m.role, m.created_at, u.last_sign_in_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.shop_id = p_shop_id
  order by m.role, u.email;
end $$;

revoke execute on function public.list_members(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;

-- For the invite-member Edge Function (service role only): find an existing account by email.
create function public.user_id_by_email(p_email text)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1 $$;

revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;

-- D1: owners change name, currency, timezone (grant and policy exist). Reject unknown time zones and write an audit event.
create function public.guard_shop_settings() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.timezone is distinct from old.timezone and not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone "%".', new.timezone using errcode = '22023';
  end if;
  insert into public.audit_events (shop_id, actor, kind, entity, entity_id, data)
  values (new.id, auth.uid(), 'shop.updated', 'shop', new.id,
          jsonb_build_object('before', jsonb_build_object('name', old.name, 'currency', old.currency, 'timezone', old.timezone),
                             'after', jsonb_build_object('name', new.name, 'currency', new.currency, 'timezone', new.timezone)));
  return new;
end $$;

create trigger shops_guard_settings before update on public.shops
for each row when (old.name is distinct from new.name or old.currency is distinct from new.currency or old.timezone is distinct from new.timezone)
execute function public.guard_shop_settings();
