-- NATURA VIDA BOLIVIA — ESQUEMA SUPABASE V5.1 ESTABLE
-- Supabase como núcleo principal; IndexedDB queda como caché offline.
-- Uso interno: políticas simples para reducir bloqueos operativos.
-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- Este script NO borra datos.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  role text not null default 'Revendedor',
  role_id text,
  status text not null default 'active',
  phone text,
  city text,
  document_id text,
  last_seen_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
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
  photo_url text,
  status text not null default 'active',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id text primary key,
  representative_user_id uuid references auth.users(id) on delete set null,
  representative_name text,
  status text not null default 'pending',
  total numeric not null default 0,
  note text default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id text primary key,
  conversation_id text,
  type text not null default 'general',
  title text not null default 'Mensaje',
  body text default '',
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_role text,
  recipient_role text default 'Administrador',
  recipient_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'unread',
  read_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_events (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);


-- V5.1: completar columnas faltantes si products fue creada manualmente con pocas columnas.
alter table public.products add column if not exists category text default 'General';
alter table public.products add column if not exists sku text default '';
alter table public.products add column if not exists description text default '';
alter table public.products add column if not exists cost numeric not null default 0;
alter table public.products add column if not exists market_price numeric not null default 0;
alter table public.products add column if not exists reseller_price numeric not null default 0;
alter table public.products add column if not exists public_price numeric not null default 0;
alter table public.products add column if not exists stock integer not null default 0;
alter table public.products add column if not exists photo text;
alter table public.products add column if not exists status text not null default 'active';

-- V5.1: completar columnas faltantes para ventas, pedidos y mensajes si existían parcialmente.
alter table public.sales add column if not exists seller_user_id uuid references auth.users(id) on delete set null;
alter table public.sales add column if not exists seller_name text;
alter table public.sales add column if not exists client_name text;
alter table public.sales add column if not exists client_phone text;
alter table public.sales add column if not exists sale_type text;
alter table public.sales add column if not exists total numeric not null default 0;
alter table public.sales add column if not exists seller_profit numeric not null default 0;
alter table public.sales add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.purchase_orders add column if not exists representative_user_id uuid references auth.users(id) on delete set null;
alter table public.purchase_orders add column if not exists representative_name text;
alter table public.purchase_orders add column if not exists status text not null default 'pending';
alter table public.purchase_orders add column if not exists total numeric not null default 0;
alter table public.purchase_orders add column if not exists note text default '';
alter table public.purchase_orders add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.messages add column if not exists type text not null default 'general';
alter table public.messages add column if not exists title text not null default 'Mensaje';
alter table public.messages add column if not exists body text default '';
alter table public.messages add column if not exists sender_user_id uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists sender_name text;
alter table public.messages add column if not exists sender_role text;
alter table public.messages add column if not exists recipient_role text default 'Administrador';
alter table public.messages add column if not exists recipient_user_id uuid references auth.users(id) on delete set null;
alter table public.messages add column if not exists status text not null default 'unread';
alter table public.messages add column if not exists payload jsonb not null default '{}'::jsonb;

-- Actualizaciones seguras para bases creadas con versiones anteriores.
alter table public.products add column if not exists photo_url text;
alter table public.products add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists document_id text;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.sales add column if not exists updated_at timestamptz not null default now();
alter table public.messages add column if not exists conversation_id text;
alter table public.messages add column if not exists read_at timestamptz;

-- Índices de sincronización incremental.
create index if not exists idx_products_updated_at on public.products(updated_at);
create index if not exists idx_products_status on public.products(status);
create index if not exists idx_purchase_orders_status on public.purchase_orders(status);
create index if not exists idx_purchase_orders_updated_at on public.purchase_orders(updated_at);
create index if not exists idx_messages_status on public.messages(status);
create index if not exists idx_messages_updated_at on public.messages(updated_at);

-- Storage para imágenes. Las imágenes no viajan en JSON ni respaldos.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Políticas simples de Storage para uso interno.
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
for select using (bucket_id = 'product-images');

drop policy if exists product_images_auth_insert on storage.objects;
create policy product_images_auth_insert on storage.objects
for insert with check (bucket_id = 'product-images');

drop policy if exists product_images_auth_update on storage.objects;
create policy product_images_auth_update on storage.objects
for update using (bucket_id = 'product-images') with check (bucket_id = 'product-images');

-- Uso interno: se desactiva RLS en tablas de negocio para evitar bloqueos mientras se estabiliza la operación.
-- Si más adelante se necesita seguridad estricta, se puede activar RLS con políticas por rol.
alter table public.profiles disable row level security;
alter table public.products disable row level security;
alter table public.clients disable row level security;
alter table public.sales disable row level security;
alter table public.purchase_orders disable row level security;
alter table public.messages disable row level security;
alter table public.sync_events disable row level security;

-- Trigger de updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_messages_updated_at on public.messages;
create trigger trg_messages_updated_at before update on public.messages
for each row execute function public.set_updated_at();

-- Vista simple para reportes.
create or replace view public.v_sales_summary as
select
  seller_name,
  date_trunc('day', created_at) as sale_day,
  count(*) as sales_count,
  sum(total) as total_sales,
  sum(seller_profit) as total_profit
from public.sales
group by seller_name, date_trunc('day', created_at);

