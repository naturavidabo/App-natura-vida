-- GOOD KING · SUPABASE V0.5.1 · CORRECCIÓN DE EJECUCIÓN
-- Esquema base seguro para operación local-first y sincronización autenticada.
-- Ejecutar en un proyecto NUEVO desde Supabase > SQL Editor.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'America/La_Paz',
  currency_code text not null default 'BOB',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','owner','helper')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (business_id, user_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data->>'display_name', split_part(coalesce(email, ''), '@', 1))
from auth.users
on conflict (id) do nothing;

create table if not exists public.devices (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  device_name text not null,
  platform text,
  app_version text,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.app_settings (
  business_id uuid not null references public.businesses(id) on delete cascade,
  setting_key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (business_id, setting_key)
);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  code text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  unique (business_id, code)
);

create table if not exists public.products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(12,2) not null default 0 check (price >= 0),
  image_url text,
  icon text,
  availability text not null default 'available' check (availability in ('available','low_stock','sold_out')),
  sort_order integer not null default 0,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.customers (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  credit_allowed boolean not null default false,
  credit_limit numeric(12,2),
  balance numeric(12,2) not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.cash_sessions (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_date date not null,
  opening_amount numeric(12,2) not null default 0,
  expected_cash numeric(12,2),
  counted_cash numeric(12,2),
  difference numeric(12,2),
  next_fund numeric(12,2),
  status text not null check (status in ('open','closed')),
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create unique index if not exists one_open_cash_per_business
on public.cash_sessions (business_id)
where status = 'open' and deleted_at is null;

create table if not exists public.sales (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  cash_session_id uuid references public.cash_sessions(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  business_date date not null,
  order_number integer not null check (order_number > 0),
  order_type text not null check (order_type in ('table','takeaway')),
  payment_method text not null check (payment_method in ('cash','qr','credit')),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0 check (total >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  notes text,
  quick_notes jsonb not null default '[]'::jsonb,
  cancelled_reason text,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  cancelled_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  unique (business_id, business_date, order_number)
);

create table if not exists public.sale_items (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.customer_credit_movements (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  movement_type text not null check (movement_type in ('charge','payment','adjustment')),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text check (payment_method in ('cash','qr')),
  detail text,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.ingredients (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  base_unit text not null,
  purchase_unit text,
  conversion_factor numeric(14,4),
  average_cost numeric(14,4) not null default 0,
  minimum_stock numeric(14,4) not null default 0,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.recipes (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  yield_quantity numeric(12,3) not null default 1,
  indirect_cost numeric(12,2) not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  unique (business_id, product_id)
);

create table if not exists public.recipe_items (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.inventory_items (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  theoretical_quantity numeric(14,4) not null default 0,
  physical_quantity numeric(14,4),
  last_counted_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  unique (business_id, ingredient_id)
);

create table if not exists public.inventory_movements (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  movement_type text not null check (movement_type in ('purchase','sale','adjustment','waste','internal_use','reversal')),
  quantity numeric(14,4) not null,
  unit_cost numeric(14,4),
  reference_type text,
  reference_id uuid,
  detail text,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.purchases (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_date date not null,
  supplier text,
  payment_source text not null default 'external' check (payment_source in ('cash_register','external','credit')),
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.purchase_items (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  purchase_unit text,
  quantity numeric(14,4) not null check (quantity > 0),
  converted_quantity numeric(14,4),
  unit_price numeric(14,4) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.market_lists (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  list_date date not null,
  status text not null default 'draft' check (status in ('draft','shopping','completed','cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.market_list_items (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  market_list_id uuid not null references public.market_lists(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  description text not null,
  planned_quantity numeric(14,4),
  purchase_unit text,
  checked boolean not null default false,
  actual_quantity numeric(14,4),
  actual_price numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.expenses (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  expense_date date not null,
  category text not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','qr','external')),
  recurring boolean not null default false,
  recurrence text,
  created_by uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1
);

create table if not exists public.audit_logs (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null
);

create table if not exists public.sync_events (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  entity text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert','delete')),
  payload jsonb not null default '{}'::jsonb,
  sync_status text not null default 'received' check (sync_status in ('received','processed','error')),
  error_message text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.schema_migrations (
  version text primary key,
  description text not null,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations(version, description)
values ('0.5.0', 'Esquema inicial Good King con Auth, RLS y tablas maestras')
on conflict (version) do nothing;

-- Índices principales
create index if not exists business_members_user_idx on public.business_members(user_id, active);
create index if not exists sales_business_date_idx on public.sales(business_id, business_date desc);
create index if not exists sales_cash_session_idx on public.sales(cash_session_id);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists credit_customer_idx on public.customer_credit_movements(customer_id, created_at desc);
create index if not exists inventory_movements_item_idx on public.inventory_movements(inventory_item_id, created_at desc);
create index if not exists purchases_date_idx on public.purchases(business_id, purchase_date desc);
create index if not exists expenses_date_idx on public.expenses(business_id, expense_date desc);
create index if not exists audit_business_date_idx on public.audit_logs(business_id, created_at desc);
create index if not exists sync_events_device_idx on public.sync_events(device_id, created_at desc);
create index if not exists sync_events_entity_idx on public.sync_events(business_id, entity, entity_id);

-- Funciones de autorización. SECURITY DEFINER evita recursión de RLS.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.active = true
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.active = true
      and bm.role = any(p_roles)
  );
$$;

create or replace function public.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs on theirs.business_id = mine.business_id
    where mine.user_id = auth.uid()
      and mine.active = true
      and theirs.user_id = p_user_id
      and theirs.active = true
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, text[]) from public;
revoke all on function public.shares_business_with(uuid) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
-- Esta línea debe copiarse completa. Corrige el error 'grant execute on;'
grant execute on function public.shares_business_with(uuid) to authenticated;

-- Habilitar RLS
alter table public.businesses enable row level security;
alter table public.profiles enable row level security;
alter table public.business_members enable row level security;
alter table public.devices enable row level security;
alter table public.app_settings enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.customer_credit_movements enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.market_lists enable row level security;
alter table public.market_list_items enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_events enable row level security;
alter table public.schema_migrations enable row level security;

-- Permisos SQL: ninguna operación de negocio para anon.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke delete on all tables in schema public from authenticated;

-- Políticas básicas
create policy businesses_select on public.businesses for select to authenticated
using (public.is_business_member(id));
create policy businesses_update on public.businesses for update to authenticated
using (public.has_business_role(id, array['admin','owner']))
with check (public.has_business_role(id, array['admin','owner']));

create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.shares_business_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy members_select on public.business_members for select to authenticated
using (public.is_business_member(business_id));
create policy members_insert_admin on public.business_members for insert to authenticated
with check (public.has_business_role(business_id, array['admin']));
create policy members_update_admin on public.business_members for update to authenticated
using (public.has_business_role(business_id, array['admin']))
with check (public.has_business_role(business_id, array['admin']));

create policy devices_select on public.devices for select to authenticated
using (public.is_business_member(business_id));
create policy devices_insert on public.devices for insert to authenticated
with check (public.is_business_member(business_id) and (user_id = auth.uid() or user_id is null));
create policy devices_update on public.devices for update to authenticated
using (public.is_business_member(business_id) and (user_id = auth.uid() or public.has_business_role(business_id, array['admin','owner'])))
with check (public.is_business_member(business_id));

-- Lectura para cualquier miembro
create policy settings_select on public.app_settings for select to authenticated using (public.is_business_member(business_id));
create policy categories_select on public.product_categories for select to authenticated using (public.is_business_member(business_id));
create policy products_select on public.products for select to authenticated using (public.is_business_member(business_id));
create policy customers_select on public.customers for select to authenticated using (public.is_business_member(business_id));
create policy ingredients_select on public.ingredients for select to authenticated using (public.is_business_member(business_id));
create policy recipes_select on public.recipes for select to authenticated using (public.is_business_member(business_id));
create policy recipe_items_select on public.recipe_items for select to authenticated using (public.is_business_member(business_id));
create policy inventory_items_select on public.inventory_items for select to authenticated using (public.is_business_member(business_id));
create policy inventory_movements_select on public.inventory_movements for select to authenticated using (public.is_business_member(business_id));
create policy purchases_select on public.purchases for select to authenticated using (public.is_business_member(business_id));
create policy purchase_items_select on public.purchase_items for select to authenticated using (public.is_business_member(business_id));
create policy market_lists_select on public.market_lists for select to authenticated using (public.is_business_member(business_id));
create policy market_list_items_select on public.market_list_items for select to authenticated using (public.is_business_member(business_id));
create policy expenses_select on public.expenses for select to authenticated using (public.is_business_member(business_id));

-- Escritura de configuración: admin o propietaria
create policy settings_write on public.app_settings for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy categories_write on public.product_categories for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy products_write on public.products for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy customers_write on public.customers for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy ingredients_write on public.ingredients for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy recipes_write on public.recipes for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy recipe_items_write on public.recipe_items for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy inventory_items_write on public.inventory_items for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy inventory_movements_write on public.inventory_movements for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy purchases_write on public.purchases for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy purchase_items_write on public.purchase_items for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy market_lists_write on public.market_lists for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy market_list_items_write on public.market_list_items for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));
create policy expenses_write on public.expenses for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));

-- Operación diaria: cualquier miembro activo puede abrir caja y vender.
create policy cash_select on public.cash_sessions for select to authenticated using (public.is_business_member(business_id));
create policy cash_insert on public.cash_sessions for insert to authenticated with check (public.is_business_member(business_id));
create policy cash_update on public.cash_sessions for update to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy sales_select on public.sales for select to authenticated using (public.is_business_member(business_id));
create policy sales_insert on public.sales for insert to authenticated with check (public.is_business_member(business_id));
create policy sales_update on public.sales for update to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy sale_items_select on public.sale_items for select to authenticated using (public.is_business_member(business_id));
create policy sale_items_insert on public.sale_items for insert to authenticated with check (public.is_business_member(business_id));
create policy sale_items_update on public.sale_items for update to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

create policy credit_select on public.customer_credit_movements for select to authenticated using (public.is_business_member(business_id));
create policy credit_write on public.customer_credit_movements for all to authenticated
using (public.has_business_role(business_id, array['admin','owner']))
with check (public.has_business_role(business_id, array['admin','owner']));

-- Auditoría: todos insertan; solamente admin/propietaria consultan.
create policy audit_select on public.audit_logs for select to authenticated
using (public.has_business_role(business_id, array['admin','owner']));
create policy audit_insert on public.audit_logs for insert to authenticated
with check (public.is_business_member(business_id));

-- Cola remota: solamente usuarios autenticados del negocio.
create policy sync_select on public.sync_events for select to authenticated using (public.is_business_member(business_id));
create policy sync_insert on public.sync_events for insert to authenticated with check (public.is_business_member(business_id));
create policy sync_update on public.sync_events for update to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

-- Migraciones: lectura para miembros; sin escritura desde la app.
create policy migrations_select on public.schema_migrations for select to authenticated using (true);

-- Triggers updated_at/version
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'businesses','profiles','business_members','devices','app_settings','product_categories','products',
    'customers','cash_sessions','sales','sale_items','customer_credit_movements','ingredients','recipes',
    'recipe_items','inventory_items','inventory_movements','purchases','purchase_items','market_lists',
    'market_list_items','expenses','sync_events'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

commit;
