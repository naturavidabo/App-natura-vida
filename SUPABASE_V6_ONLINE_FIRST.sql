-- NATURA VIDA V6 — ESQUEMA ONLINE-FIRST SUPABASE
-- Ejecutar en Supabase SQL Editor antes de publicar la app.
-- Objetivo: Supabase Auth + PostgreSQL como fuente oficial. Celular = caché temporal.

create extension if not exists pgcrypto;

-- PERFIL DE USUARIO / ROLES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  email text unique,
  full_name text not null default '',
  role text not null default 'representante' check (role in ('administrador','representante')),
  role_id text,
  status text not null default 'pendiente' check (status in ('pendiente','activo','bloqueado')),
  phone text default '',
  city text default '',
  document_id text default '',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrador' and status = 'activo'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

-- PRODUCTOS OFICIALES
create table if not exists public.products (
  id text primary key,
  name text not null,
  category text default 'General',
  sku text default '',
  description text default '',
  cost numeric default 0,
  market_price numeric default 0,
  reseller_price numeric default 0,
  public_price numeric default 0,
  stock numeric default 0,
  photo text,
  photo_url text,
  status text default 'active',
  payload jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.touch_updated_at();

-- STOCK PROPIO DE REPRESENTANTES
create table if not exists public.representative_stock (
  representative_user_id uuid references auth.users(id) on delete cascade,
  product_id text references public.products(id) on delete cascade,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (representative_user_id, product_id)
);

create table if not exists public.representative_stock_movements (
  id uuid primary key default gen_random_uuid(),
  representative_user_id uuid references auth.users(id) on delete cascade,
  product_id text references public.products(id) on delete cascade,
  delta numeric not null,
  reason text default '',
  source_id text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function public.adjust_representative_stock(
  p_representative_user_id uuid,
  p_product_id text,
  p_delta numeric,
  p_reason text default '',
  p_source_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_admin() and auth.uid() <> p_representative_user_id then
    raise exception 'not allowed';
  end if;

  insert into public.representative_stock(representative_user_id, product_id, quantity, updated_at)
  values (p_representative_user_id, p_product_id, p_delta, now())
  on conflict (representative_user_id, product_id)
  do update set quantity = public.representative_stock.quantity + excluded.quantity,
                updated_at = now();

  insert into public.representative_stock_movements(representative_user_id, product_id, delta, reason, source_id, created_by)
  values (p_representative_user_id, p_product_id, p_delta, p_reason, p_source_id, auth.uid());
end;
$$;

-- CLIENTES, VENTAS, PEDIDOS Y MENSAJES
create table if not exists public.clients (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text default '',
  city text default '',
  address text default '',
  lat numeric,
  lng numeric,
  notes text default '',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
for each row execute function public.touch_updated_at();

create table if not exists public.sales (
  id text primary key,
  client_generated_id text unique,
  seller_id uuid references auth.users(id) on delete set null,
  client_id text,
  client_name text default '',
  total numeric default 0,
  type text default '',
  items jsonb default '[]'::jsonb,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at before update on public.sales
for each row execute function public.touch_updated_at();

create table if not exists public.purchase_orders (
  id text primary key,
  representative_user_id uuid references auth.users(id) on delete set null,
  status text default 'pending',
  total numeric default 0,
  items jsonb default '[]'::jsonb,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at before update on public.purchase_orders
for each row execute function public.touch_updated_at();

create table if not exists public.inbox_messages (
  id text primary key,
  sender_id uuid references auth.users(id) on delete set null,
  recipient_id uuid references auth.users(id) on delete set null,
  title text default '',
  body text default '',
  read_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_inbox_messages_updated_at on public.inbox_messages;
create trigger trg_inbox_messages_updated_at before update on public.inbox_messages
for each row execute function public.touch_updated_at();

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.representative_stock enable row level security;
alter table public.representative_stock_movements enable row level security;
alter table public.clients enable row level security;
alter table public.sales enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.audit_log enable row level security;

-- Limpiar políticas previas con nombres de V6
DROP POLICY IF EXISTS "profiles_select_v6" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self_v6" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_or_admin_v6" ON public.profiles;
DROP POLICY IF EXISTS "products_read_active_v6" ON public.products;
DROP POLICY IF EXISTS "products_admin_write_v6" ON public.products;
DROP POLICY IF EXISTS "rep_stock_read_v6" ON public.representative_stock;
DROP POLICY IF EXISTS "rep_stock_write_v6" ON public.representative_stock;
DROP POLICY IF EXISTS "rep_mov_read_v6" ON public.representative_stock_movements;
DROP POLICY IF EXISTS "clients_owner_or_admin_v6" ON public.clients;
DROP POLICY IF EXISTS "sales_owner_or_admin_v6" ON public.sales;
DROP POLICY IF EXISTS "orders_owner_or_admin_v6" ON public.purchase_orders;
DROP POLICY IF EXISTS "inbox_owner_or_admin_v6" ON public.inbox_messages;
DROP POLICY IF EXISTS "audit_admin_read_v6" ON public.audit_log;
DROP POLICY IF EXISTS "audit_insert_auth_v6" ON public.audit_log;

CREATE POLICY "profiles_select_v6" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert_self_v6" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin_v6" ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "products_read_active_v6" ON public.products FOR SELECT USING (status = 'active' OR public.is_admin());
CREATE POLICY "products_admin_write_v6" ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "rep_stock_read_v6" ON public.representative_stock FOR SELECT USING (representative_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rep_stock_write_v6" ON public.representative_stock FOR ALL USING (representative_user_id = auth.uid() OR public.is_admin()) WITH CHECK (representative_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "rep_mov_read_v6" ON public.representative_stock_movements FOR SELECT USING (representative_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "clients_owner_or_admin_v6" ON public.clients FOR ALL USING (owner_user_id = auth.uid() OR public.is_admin()) WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "sales_owner_or_admin_v6" ON public.sales FOR ALL USING (seller_id = auth.uid() OR public.is_admin()) WITH CHECK (seller_id = auth.uid() OR public.is_admin());
CREATE POLICY "orders_owner_or_admin_v6" ON public.purchase_orders FOR ALL USING (representative_user_id = auth.uid() OR public.is_admin()) WITH CHECK (representative_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "inbox_owner_or_admin_v6" ON public.inbox_messages FOR ALL USING (recipient_id = auth.uid() OR sender_id = auth.uid() OR public.is_admin()) WITH CHECK (recipient_id = auth.uid() OR sender_id = auth.uid() OR public.is_admin());
CREATE POLICY "audit_admin_read_v6" ON public.audit_log FOR SELECT USING (public.is_admin());
CREATE POLICY "audit_insert_auth_v6" ON public.audit_log FOR INSERT WITH CHECK (actor_id = auth.uid() OR actor_id is null);

-- Storage para imágenes de productos
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Recomendado en Authentication > URL Configuration:
-- Site URL: https://TU_USUARIO.github.io/TU_REPOSITORIO/
-- Redirect URLs: https://TU_USUARIO.github.io/TU_REPOSITORIO/*
