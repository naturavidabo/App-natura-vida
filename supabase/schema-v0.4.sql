-- Good King V0.4 · ejecutar una sola vez en Supabase SQL Editor
-- Este esquema crea una bitácora remota segura para la primera sincronización.

create extension if not exists pgcrypto;

create table if not exists public.sync_events (
  id text primary key,
  device_id text not null,
  entity text not null,
  entity_id text not null,
  operation text not null check (operation in ('upsert','delete')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sync_events_entity_idx on public.sync_events(entity, entity_id);
create index if not exists sync_events_device_idx on public.sync_events(device_id, created_at desc);

alter table public.sync_events enable row level security;
grant insert, update on public.sync_events to anon, authenticated;

-- V0.4 funciona inicialmente con la clave pública. Para una prueba controlada del negocio,
-- permite inserción de eventos. Antes de uso definitivo multiusuario, sustituir por políticas
-- basadas en auth.uid() y perfiles de negocio.
drop policy if exists "good_king_insert_sync_events" on public.sync_events;
create policy "good_king_insert_sync_events"
on public.sync_events for insert
to anon, authenticated
with check (true);

drop policy if exists "good_king_update_sync_events" on public.sync_events;
create policy "good_king_update_sync_events"
on public.sync_events for update
to anon, authenticated
using (true)
with check (true);

-- Tablas estructurales reservadas para el panel remoto.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin','owner','helper')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key,
  business_date date not null,
  order_number integer not null,
  cash_session_id uuid,
  order_type text not null,
  payment_method text not null,
  total numeric(12,2) not null,
  status text not null default 'confirmed',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (business_date, order_number)
);

create table if not exists public.cash_sessions (
  id uuid primary key,
  business_date date not null,
  opening_amount numeric(12,2) not null default 0,
  closing_amount numeric(12,2),
  next_fund numeric(12,2),
  opened_at timestamptz not null,
  closed_at timestamptz,
  status text not null,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.clients (
  id uuid primary key,
  name text not null,
  phone text,
  credit_allowed boolean not null default false,
  balance numeric(12,2) not null default 0,
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.client_payments (
  id uuid primary key,
  client_id uuid not null references public.clients(id),
  movement_type text not null,
  amount numeric(12,2) not null,
  payment_method text,
  detail text,
  created_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb
);

alter table public.profiles enable row level security;
alter table public.sales enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.clients enable row level security;
alter table public.client_payments enable row level security;
