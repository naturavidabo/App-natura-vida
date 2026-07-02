-- NATURA VIDA — MIGRACIÓN V6.7
-- ORDEN DE DEPURACIÓN Y RECONSTRUCCIÓN DE ACCESO — V6
-- Ejecutar en Supabase > SQL Editor > New query > Run.
--
-- ⚠️ IRREVERSIBLE: borra TODOS los usuarios (incluido el admin actual).
-- Tras correr esto, NADIE puede iniciar sesión hasta volver a registrarse
-- con "Crear cuenta". El primer registro nuevo se vuelve administrador
-- automáticamente (lógica ya implementada en V6.6, sección 1 de abajo).
--
-- NO TOCA: products, sales, purchase_orders, representative_stock,
-- representative_stock_movements. Esas tablas quedan intactas.

-- ============================================================================
-- 1) BORRADO TOTAL DE USUARIOS (sección 1 de la orden)
-- ============================================================================

-- profiles tiene "on delete cascade" hacia auth.users, así que borrar
-- auth.users ya arrastra profiles. Por las dudas (y para que quede explícito
-- y verificable), se borra profiles primero y auth.users después.
delete from public.profiles;
delete from auth.users;

-- ============================================================================
-- 2) NUEVO ESQUEMA DE PERFIL — Gmail real + campos obligatorios (sección 4)
-- ============================================================================

alter table public.profiles add column if not exists phone text;
-- (city, full_name, email, role, status, last_login_at ya existen desde V6.6)

-- A partir de ahora el email debe ser un Gmail real. No se puede forzar esto
-- 100% desde SQL (Supabase Auth valida formato de correo, no el dominio),
-- así que la validación de "debe ser @gmail.com" se hace en el código
-- (ver auth.js, registerNewAccount). Aquí solo se documenta la regla.
comment on column public.profiles.email is 'V6.7: debe ser un correo Gmail real, validado en el cliente (auth.js). Ya no se usan correos sintéticos.';

-- ============================================================================
-- 3) TABLA DE CLIENTES (necesaria para que el futuro botón único de
--    sincronización pueda "subir clientes pendientes", pedida en la orden
--    de refactorización anterior y reconfirmada aquí indirectamente).
-- ============================================================================

create table if not exists public.clients (
  id text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  phone text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_owner on public.clients(owner_user_id);
alter table public.clients enable row level security;
drop policy if exists "clients_owner_or_admin" on public.clients;
create policy "clients_owner_or_admin" on public.clients
  for all
  using (
    auth.uid() = owner_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'administrador')
  )
  with check (
    auth.uid() = owner_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'administrador')
  );

-- ============================================================================
-- 4) AUDITORÍA BÁSICA EN TABLAS CRÍTICAS (sección 6)
-- ============================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_table on public.audit_log(table_name, created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "audit_log_admin_read" on public.audit_log;
create policy "audit_log_admin_read" on public.audit_log
  for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'administrador'));
drop policy if exists "audit_log_own_write" on public.audit_log;
create policy "audit_log_own_write" on public.audit_log
  for insert
  with check (auth.uid() = actor_user_id);

-- Función helper para insertar auditoría desde el cliente sin exponer la
-- tabla a escritura libre (más estricto que un insert directo: fuerza que
-- actor_user_id sea siempre el auth.uid() real de quien llama).
create or replace function public.log_audit_event(
  p_action text,
  p_table_name text,
  p_record_id text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (actor_user_id, actor_email, action, table_name, record_id, details)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), p_action, p_table_name, p_record_id, p_details);
end;
$$;
revoke all on function public.log_audit_event(text, text, text, jsonb) from public;
grant execute on function public.log_audit_event(text, text, text, jsonb) to authenticated;

-- ============================================================================
-- 5) CONFIRMACIÓN: el stock del representante SOLO se escribe vía RPC
--    (sección 6 de la orden — "sin rutas alternas que escriban stock
--    directamente"). Esto YA estaba implementado en V6.4
--    (SUPABASE_MIGRACION_V6_4_STOCK_ATOMICO_RLS.sql): la tabla
--    representative_stock tiene RLS que exige auth.uid() = representative_user_id
--    para cualquier escritura directa, y el código del cliente (js/sales.js,
--    js/products.js) ya solo llama a adjust_representative_stock(), nunca
--    hace upsert directo de un valor de stock. No se requiere ningún cambio
--    de esquema adicional aquí — se deja esta sección como confirmación
--    explícita pedida en el punto 7 de la orden.
-- ============================================================================

-- ============================================================================
-- 6) REALTIME (sección 5) — habilitar replicación en vivo para las tablas
--    que la app necesita ver actualizarse sin refrescar manualmente.
-- ============================================================================
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.purchase_orders;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.representative_stock;
alter publication supabase_realtime add table public.profiles;
