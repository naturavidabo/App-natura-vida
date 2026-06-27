-- NATURA VIDA — MIGRACIÓN V6.4
-- 1) Descuento/ajuste ATÓMICO del stock propio del representante (función RPC),
--    en vez de enviar un valor absoluto ya calculado en el celular.
-- 2) Políticas RLS para que cada representante solo pueda leer/modificar
--    su propio stock, usando auth.uid().
--
-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- Requiere haber ejecutado antes SUPABASE_MIGRACION_V6_3_STOCK_REPRESENTANTE.sql
-- (crea la tabla public.representative_stock).
-- Este script NO borra datos existentes.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) Registro de movimientos aplicados, para que un reintento de red nunca
--    aplique el mismo ajuste dos veces (idempotencia real, no solo "upsert").
-- ----------------------------------------------------------------------------
create table if not exists public.representative_stock_movements (
  id uuid primary key,
  representative_user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  delta integer not null,
  resulting_stock integer not null,
  applied_at timestamptz not null default now()
);

create index if not exists idx_repstock_mov_rep on public.representative_stock_movements(representative_user_id);

-- ----------------------------------------------------------------------------
-- 2) Función RPC: aplica un AJUSTE (positivo o negativo) de forma atómica.
--    - El representante NUNCA manda "mi stock final es X". Manda "aplica
--      este cambio de Y unidades" (Y puede ser negativo, ej.: una venta).
--    - Postgres garantiza que, si dos celulares del mismo representante
--      mandan su ajuste casi al mismo tiempo, ambos ajustes se suman
--      correctamente sobre el valor real más reciente — no se pierde
--      ninguno de los dos (a diferencia de mandar un valor absoluto, donde
--      el que llega último pisa por completo al que llegó antes).
--    - p_movement_id identifica de forma única ese ajuste concreto (se
--      genera una sola vez en el celular y se reutiliza en cada reintento).
--      Si ese movimiento ya se aplicó antes, la función no lo vuelve a
--      aplicar — solo devuelve el resultado que ya había quedado.
--    - auth.uid() identifica al representante: NO se recibe como parámetro,
--      así no hay forma de que alguien intente ajustar el stock de otra
--      persona mandando un id distinto al suyo.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_representative_stock(
  p_movement_id uuid,
  p_product_id text,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep_id uuid := auth.uid();
  v_existing_stock integer;
  v_new_stock integer;
begin
  if v_rep_id is null then
    raise exception 'No autenticado: se necesita una sesión válida de Supabase para ajustar stock.';
  end if;

  -- Idempotencia: si este movimiento concreto ya se aplicó (reintento tras
  -- perder la respuesta de red, por ejemplo), no se aplica de nuevo.
  select resulting_stock into v_existing_stock
  from public.representative_stock_movements
  where id = p_movement_id;

  if v_existing_stock is not null then
    return v_existing_stock;
  end if;

  insert into public.representative_stock (representative_user_id, product_id, stock, updated_at)
  values (v_rep_id, p_product_id, greatest(0, p_delta), now())
  on conflict (representative_user_id, product_id)
  do update set
    stock = greatest(0, public.representative_stock.stock + p_delta),
    updated_at = now()
  returning stock into v_new_stock;

  insert into public.representative_stock_movements (id, representative_user_id, product_id, delta, resulting_stock)
  values (p_movement_id, v_rep_id, p_product_id, p_delta, v_new_stock);

  return v_new_stock;
end;
$$;

revoke all on function public.adjust_representative_stock(uuid, text, integer) from public;
grant execute on function public.adjust_representative_stock(uuid, text, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) RLS: cada representante solo puede leer/escribir sus propias filas.
--    La función de arriba es "security definer", así que sigue funcionando
--    igual aunque se active RLS (el filtro de abajo es para bloquear el
--    acceso DIRECTO a la tabla desde fuera de esa función, ej.: alguien
--    usando la API REST de Supabase directamente con su propia sesión).
-- ----------------------------------------------------------------------------
alter table public.representative_stock enable row level security;

drop policy if exists "rep_stock_own_rows" on public.representative_stock;
create policy "rep_stock_own_rows" on public.representative_stock
  for all
  using (auth.uid() = representative_user_id)
  with check (auth.uid() = representative_user_id);

alter table public.representative_stock_movements enable row level security;

drop policy if exists "rep_stock_mov_own_rows" on public.representative_stock_movements;
create policy "rep_stock_mov_own_rows" on public.representative_stock_movements
  for select
  using (auth.uid() = representative_user_id);
-- No se agrega política de escritura directa para representative_stock_movements:
-- solo la función adjust_representative_stock (security definer) inserta ahí.
-- Cualquier intento de insertar/editar directo desde el cliente queda bloqueado.
