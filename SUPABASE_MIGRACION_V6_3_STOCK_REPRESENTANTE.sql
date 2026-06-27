-- NATURA VIDA — MIGRACIÓN V6.3
-- Stock propio del representante, sincronizado en la nube.
-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- Este script NO borra ni modifica datos existentes, solo agrega una tabla nueva.

create extension if not exists pgcrypto;

create table if not exists public.representative_stock (
  id uuid primary key default gen_random_uuid(),
  representative_user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  stock integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (representative_user_id, product_id)
);

create index if not exists idx_representative_stock_rep on public.representative_stock(representative_user_id);
create index if not exists idx_representative_stock_product on public.representative_stock(product_id);

-- Uso interno: igual que el resto de las tablas de negocio de este
-- proyecto, se desactiva RLS para evitar bloqueos operativos. Solo el
-- usuario autenticado (vinculado tras la activación de su celular) puede
-- escribir en su propia fila gracias a que el código siempre usa su
-- representative_user_id real; aun así, si más adelante se quiere reforzar
-- esto con políticas de seguridad por fila, esta es la tabla a la que
-- habría que agregárselas.
alter table public.representative_stock disable row level security;
