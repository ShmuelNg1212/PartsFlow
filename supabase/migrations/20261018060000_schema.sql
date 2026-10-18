-- PartsFlow schema, grants, and row-level security (plan T1.1).
-- Rules: R-DATA-1..8, R-ROLE-1, R-DOC-4, R-POST-10, R-DEMO-1. Decisions: ADR 0001, 0004.
--
-- Grant model: clients (anon, authenticated) get nothing by default. Authenticated users get
-- select on shop data and insert/update on the editable columns only. Status, posting fields,
-- file hash, raw extracted values, ledger tables, and audit events have no client write grant.
-- Only the security definer functions in later migrations write them.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Part numbers are compared without spaces, dashes, dots, or slashes, in upper case (R-PROD-5 matching).
create function public.normalize_part_number(p text) returns text
language sql immutable parallel safe
set search_path = ''
as $$ select nullif(upper(regexp_replace(coalesce(p, ''), '[\s\-\./]', '', 'g')), '') $$;

create function public.normalize_description(p text) returns text
language sql immutable parallel safe
set search_path = ''
as $$ select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))), '') $$;

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- True only inside post_document / reverse_document / opening functions (transaction-local flag).
-- Clients cannot set it: PostgREST exposes only functions in public, and none of them set it on request.
create function public.ledger_write_allowed() returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(current_setting('partsflow.ledger_write', true), '') = 'on' $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.shops (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Manila' check (length(timezone) between 1 and 64),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  sku text not null check (length(btrim(sku)) between 1 and 64),
  part_number text not null check (length(btrim(part_number)) between 1 and 64),
  part_number_norm text generated always as (public.normalize_part_number(part_number)) stored,
  description text not null check (length(btrim(description)) between 1 and 300),
  brand text not null check (length(btrim(brand)) between 1 and 80),
  base_unit text not null default 'pc' check (length(btrim(base_unit)) between 1 and 20),
  selling_price numeric(14, 2) not null default 0 check (selling_price >= 0),
  reorder_threshold numeric(14, 3) not null default 0 check (reorder_threshold >= 0),
  shelf_bin text check (shelf_bin is null or length(shelf_bin) <= 40),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  unique (shop_id, sku)
);
-- Same brand and same part number is one product. Different brands stay different products (R-PROD-5).
create unique index products_brand_part_uidx on public.products (shop_id, lower(brand), part_number_norm);
create index products_part_norm_idx on public.products (shop_id, part_number_norm);
create index products_description_trgm_idx on public.products using gin (description extensions.gin_trgm_ops);

create table public.counterparties (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  kind text not null check (kind in ('supplier', 'customer')),
  name text not null check (length(btrim(name)) between 1 and 160),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, shop_id)
);
create unique index counterparties_name_uidx on public.counterparties (shop_id, kind, lower(btrim(name)));

-- Supplier description → product, saved by post_document on a confirmed match (R-DOC-8).
create table public.supplier_aliases (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  counterparty_id uuid not null,
  description_norm text not null,
  part_number_norm text,
  product_id uuid not null,
  confirmed_count integer not null default 1,
  last_confirmed_at timestamptz not null default now(),
  last_confirmed_by uuid,
  foreign key (counterparty_id, shop_id) references public.counterparties (id, shop_id),
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  unique (shop_id, counterparty_id, description_norm)
);
create index supplier_aliases_product_idx on public.supplier_aliases (product_id);

create table public.documents (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  direction text not null check (direction in ('receipt', 'sale')),
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),

  -- Corrected (user-confirmed) header values.
  doc_number text check (doc_number is null or length(doc_number) <= 80),
  doc_date date,
  counterparty_id uuid,
  total_amount numeric(14, 2) check (total_amount is null or total_amount >= 0),
  notes text check (notes is null or length(notes) <= 2000),

  -- Raw extracted values. Never overwritten by a correction (R-DOC-4). Written by the extraction function only.
  raw_doc_number text,
  raw_doc_date text,
  raw_counterparty text,
  raw_totals jsonb,
  raw_extraction jsonb,
  extraction_provider text,
  extraction_status text not null default 'none'
    check (extraction_status in ('none', 'pending', 'done', 'failed', 'not_available')),

  -- Original file in private storage (R-DOC-1).
  file_path text,
  file_mime text,
  file_size bigint check (file_size is null or file_size >= 0),
  file_sha256 text,

  -- Posting and reversal. Written by post_document / reverse_document only.
  idempotency_key uuid,
  posted_at timestamptz,
  posted_by uuid,
  duplicate_override_reason text,
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text,

  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, shop_id),
  foreign key (counterparty_id, shop_id) references public.counterparties (id, shop_id),
  check ((status = 'draft') = (posted_at is null)),
  check ((status = 'reversed') = (reversed_at is not null))
);
create index documents_shop_status_idx on public.documents (shop_id, status, created_at desc);
create index documents_dup_number_idx on public.documents (shop_id, direction, counterparty_id, lower(doc_number)) where status <> 'draft';
create index documents_dup_hash_idx on public.documents (shop_id, file_sha256) where file_sha256 is not null;

create table public.document_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null,
  shop_id uuid not null,
  line_no integer not null check (line_no > 0),

  -- Corrected values.
  description text check (description is null or length(description) <= 300),
  part_number text check (part_number is null or length(part_number) <= 64),
  quantity numeric(14, 3) check (quantity is null or quantity >= 0),
  unit text check (unit is null or length(unit) <= 20),
  unit_price numeric(14, 2) check (unit_price is null or unit_price >= 0),
  discount numeric(14, 2) check (discount is null or discount >= 0),
  -- Receipts: quantity physically received (R-POST-3). The invoice quantity is not proof of delivery.
  received_quantity numeric(14, 3) check (received_quantity is null or received_quantity >= 0),
  -- Base units per line unit, entered by the user when units differ (R-POST-11). Never guessed.
  conversion_factor numeric(14, 6) check (conversion_factor is null or conversion_factor > 0),
  product_id uuid,
  match_source text check (match_source is null or match_source in ('alias', 'part_number', 'description', 'manual', 'created')),

  -- Raw extracted values per field with confidences (R-DOC-4). Extraction function only.
  raw jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (document_id, shop_id) references public.documents (id, shop_id) on delete cascade,
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  unique (document_id, line_no)
);
create index document_lines_product_idx on public.document_lines (product_id);

-- The ledger (R-DATA-1). Append-only.
create table public.stock_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null,
  product_id uuid not null,
  qty numeric(14, 3) not null check (qty <> 0),
  source text not null check (source in ('document_line', 'opening', 'reversal')),
  document_id uuid,
  document_line_id uuid references public.document_lines (id),
  reverses_movement_id uuid unique references public.stock_movements (id),
  reason text,
  actor uuid not null,
  created_at timestamptz not null default now(),
  foreign key (product_id, shop_id) references public.products (id, shop_id),
  foreign key (document_id, shop_id) references public.documents (id, shop_id),
  check (source <> 'document_line' or (document_id is not null and document_line_id is not null)),
  check (source <> 'reversal' or (reverses_movement_id is not null and reason is not null))
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index stock_movements_shop_idx on public.stock_movements (shop_id, created_at desc);
create index stock_movements_document_idx on public.stock_movements (document_id);

-- Cached balance (R-DATA-2). Written in the same transaction as the movements. See balance_reconciliation.
create table public.product_balances (
  product_id uuid primary key,
  shop_id uuid not null,
  qty numeric(14, 3) not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  foreign key (product_id, shop_id) references public.products (id, shop_id) on delete cascade
);
create index product_balances_shop_idx on public.product_balances (shop_id);

create table public.audit_events (
  id uuid primary key default extensions.gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  actor uuid,
  kind text not null,
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_shop_idx on public.audit_events (shop_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_id);

-- Ledger and balance differ only if a write path bypassed the posting functions. Expected: no rows.
create view public.balance_reconciliation with (security_invoker = true) as
select p.shop_id, p.id as product_id,
       coalesce(b.qty, 0) as cached_qty,
       coalesce(m.qty, 0) as ledger_qty
from public.products p
left join public.product_balances b on b.product_id = p.id
left join (select product_id, sum(qty) as qty from public.stock_movements group by product_id) m on m.product_id = p.id
where coalesce(b.qty, 0) <> coalesce(m.qty, 0);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies do not recurse through memberships RLS)
-- ---------------------------------------------------------------------------

create function public.is_member(p_shop uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.shop_id = p_shop and m.user_id = (select auth.uid()))
$$;

create function public.is_owner(p_shop uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create trigger shops_updated_at before update on public.shops for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger documents_updated_at before update on public.documents for each row execute function public.set_updated_at();
create trigger document_lines_updated_at before update on public.document_lines for each row execute function public.set_updated_at();

-- Documents: only the ledger functions change status or touch a non-draft document (R-DATA-7, R-POST-10).
create function public.guard_document() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.ledger_write_allowed() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'Documents start as drafts. Only the posting and reversal functions change status.' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'draft' then
    raise exception 'Document % is not a draft. Posted documents do not change; reverse it instead.', old.id using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      raise exception 'Only the posting and reversal functions change document status.' using errcode = '42501';
    end if;
    if new.shop_id is distinct from old.shop_id then
      raise exception 'A document cannot move to another shop.' using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger documents_guard before insert or update or delete on public.documents
for each row execute function public.guard_document();

-- Lines: take shop_id from the parent document and allow changes only while the parent is a draft.
create function public.guard_document_line() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_doc_id uuid := coalesce(new.document_id, old.document_id);
  v_status text;
  v_shop uuid;
begin
  select d.status, d.shop_id into v_status, v_shop from public.documents d where d.id = v_doc_id;
  if v_status is null then
    -- Parent is gone (cascade delete) or missing; the foreign key reports a missing parent.
    return coalesce(new, old);
  end if;
  if v_status <> 'draft' and not public.ledger_write_allowed() then
    raise exception 'Document % is not a draft. Posted documents do not change; reverse it instead.', v_doc_id using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.document_id is distinct from old.document_id then
    raise exception 'A line cannot move to another document.' using errcode = '42501';
  end if;
  new.shop_id := v_shop;
  return new;
end $$;

create trigger document_lines_guard before insert or update or delete on public.document_lines
for each row execute function public.guard_document_line();

-- Product changes write audit events (R-DATA-8).
create function public.audit_product_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (shop_id, actor, kind, entity, entity_id, data)
  values (
    new.shop_id,
    auth.uid(),
    case when tg_op = 'INSERT' then 'product.created' else 'product.updated' end,
    'product',
    new.id,
    case when tg_op = 'INSERT' then to_jsonb(new)
         else jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) end
  );
  return new;
end $$;

create trigger products_audit after insert or update on public.products
for each row execute function public.audit_product_change();

-- Movements are append-only, even for the functions.
create function public.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows never change. Corrections are reversals.', tg_table_name using errcode = '42501';
end $$;

create trigger stock_movements_append_only before update or delete on public.stock_movements
for each row execute function public.forbid_change();
create trigger audit_events_append_only before update or delete on public.audit_events
for each row execute function public.forbid_change();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Objects created later by this role get no client grants unless a migration grants them.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges revoke execute on functions from public;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.shops, public.memberships, public.products, public.counterparties, public.supplier_aliases,
  public.documents, public.document_lines, public.stock_movements, public.product_balances, public.audit_events,
  public.balance_reconciliation
  to authenticated;

grant update (name, currency, timezone) on public.shops to authenticated;

grant insert (shop_id, sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin)
  on public.products to authenticated;
grant update (sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin)
  on public.products to authenticated;

grant insert (shop_id, kind, name) on public.counterparties to authenticated;
grant update (name) on public.counterparties to authenticated;

grant insert (shop_id, direction, doc_number, doc_date, counterparty_id, total_amount, notes, file_path, file_mime, file_size)
  on public.documents to authenticated;
grant update (direction, doc_number, doc_date, counterparty_id, total_amount, notes, file_path, file_mime, file_size)
  on public.documents to authenticated;
grant delete on public.documents to authenticated;

grant insert (document_id, line_no, description, part_number, quantity, unit, unit_price, discount,
              received_quantity, conversion_factor, product_id, match_source)
  on public.document_lines to authenticated;
grant update (line_no, description, part_number, quantity, unit, unit_price, discount,
              received_quantity, conversion_factor, product_id, match_source)
  on public.document_lines to authenticated;
grant delete on public.document_lines to authenticated;

grant execute on function public.is_member(uuid), public.is_owner(uuid),
  public.normalize_part_number(text), public.normalize_description(text), public.ledger_write_allowed()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security (R-DATA-5)
-- ---------------------------------------------------------------------------

alter table public.shops enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;
alter table public.counterparties enable row level security;
alter table public.supplier_aliases enable row level security;
alter table public.documents enable row level security;
alter table public.document_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.product_balances enable row level security;
alter table public.audit_events enable row level security;

create policy shops_select on public.shops for select to authenticated using ((select public.is_member(id)));
create policy shops_update on public.shops for update to authenticated
  using ((select public.is_owner(id))) with check ((select public.is_owner(id)));

create policy memberships_select on public.memberships for select to authenticated using ((select public.is_member(shop_id)));

create policy products_select on public.products for select to authenticated using ((select public.is_member(shop_id)));
create policy products_insert on public.products for insert to authenticated with check ((select public.is_owner(shop_id)));
create policy products_update on public.products for update to authenticated
  using ((select public.is_owner(shop_id))) with check ((select public.is_owner(shop_id)));

create policy counterparties_select on public.counterparties for select to authenticated using ((select public.is_member(shop_id)));
create policy counterparties_insert on public.counterparties for insert to authenticated with check ((select public.is_member(shop_id)));
create policy counterparties_update on public.counterparties for update to authenticated
  using ((select public.is_owner(shop_id))) with check ((select public.is_owner(shop_id)));

create policy supplier_aliases_select on public.supplier_aliases for select to authenticated using ((select public.is_member(shop_id)));

create policy documents_select on public.documents for select to authenticated using ((select public.is_member(shop_id)));
create policy documents_insert on public.documents for insert to authenticated
  with check ((select public.is_member(shop_id)) and status = 'draft' and created_by = (select auth.uid()));
create policy documents_update on public.documents for update to authenticated
  using ((select public.is_member(shop_id)) and status = 'draft')
  with check ((select public.is_member(shop_id)) and status = 'draft');
create policy documents_delete on public.documents for delete to authenticated
  using ((select public.is_member(shop_id)) and status = 'draft');

create policy document_lines_select on public.document_lines for select to authenticated using ((select public.is_member(shop_id)));
create policy document_lines_insert on public.document_lines for insert to authenticated with check ((select public.is_member(shop_id)));
create policy document_lines_update on public.document_lines for update to authenticated
  using ((select public.is_member(shop_id))) with check ((select public.is_member(shop_id)));
create policy document_lines_delete on public.document_lines for delete to authenticated
  using ((select public.is_member(shop_id))
         and exists (select 1 from public.documents d where d.id = document_id and d.status = 'draft'));

create policy stock_movements_select on public.stock_movements for select to authenticated using ((select public.is_member(shop_id)));
create policy product_balances_select on public.product_balances for select to authenticated using ((select public.is_member(shop_id)));
create policy audit_events_select on public.audit_events for select to authenticated using ((select public.is_member(shop_id)));

-- Realtime: balances and documents push changes to open sessions (R-STOCK-3). Realtime applies RLS.
alter publication supabase_realtime add table public.product_balances, public.documents;
