-- NATURA VIDA BOLIVIA — Esquema online Supabase
-- Ejecutar en Supabase > SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  role text not null default 'Revendedor' check (role in ('Administrador','Revendedor','Supervisor')),
  role_id text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text default 'General',
  sku text default '',
  description text default '',
  cost numeric not null default 0,
  market_price numeric not null default 0,
  reseller_price numeric not null default 0,
  public_price numeric not null default 0,
  stock integer not null default 0,
  photo text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  seller_user_id uuid references auth.users(id) on delete set null,
  seller_name text,
  client_name text,
  client_phone text,
  sale_type text,
  total numeric not null default 0,
  seller_profit numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'Administrador'
      and status = 'active'
  );
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.clients enable row level security;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_read_authenticated on public.products;
create policy products_read_authenticated on public.products
for select using (auth.role() = 'authenticated' and status <> 'archived');

drop policy if exists products_admin_insert on public.products;
create policy products_admin_insert on public.products
for insert with check (public.is_admin());

drop policy if exists products_admin_update on public.products;
create policy products_admin_update on public.products
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_admin_delete on public.products;
create policy products_admin_delete on public.products
for delete using (public.is_admin());

drop policy if exists sales_insert_own_or_admin on public.sales;
create policy sales_insert_own_or_admin on public.sales
for insert with check (seller_user_id = auth.uid() or public.is_admin());

drop policy if exists sales_read_own_or_admin on public.sales;
create policy sales_read_own_or_admin on public.sales
for select using (seller_user_id = auth.uid() or public.is_admin());

drop policy if exists clients_owner_or_admin on public.clients;
create policy clients_owner_or_admin on public.clients
for all using (owner_user_id = auth.uid() or public.is_admin())
with check (owner_user_id = auth.uid() or public.is_admin());

create index if not exists idx_products_status on public.products(status);
create index if not exists idx_products_updated_at on public.products(updated_at desc);
create index if not exists idx_sales_seller on public.sales(seller_user_id);
create index if not exists idx_sales_created_at on public.sales(created_at desc);

-- Si ya tenías creada la tabla products antes de esta versión, ejecuta además:
-- alter table public.products add column if not exists market_price numeric not null default 0;

-- Después de crear usuarios en Authentication, vincularlos así:
-- insert into public.profiles (id, username, full_name, role, role_id, status)
-- values ('UUID_DEL_USUARIO_ADMIN', 'admin', 'Administrador Natura Vida', 'Administrador', 'role_admin', 'active');
--
-- insert into public.profiles (id, username, full_name, role, role_id, status)
-- values ('UUID_DEL_REVENDEDOR', 'revendedor1', 'Nombre del Revendedor', 'Revendedor', 'role_reseller', 'active');
