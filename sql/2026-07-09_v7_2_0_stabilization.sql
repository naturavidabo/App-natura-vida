-- NATURA VIDA V7.2.0 — estabilización de ventas, auditoría, QR y buzón
-- Ejecutar UNA VEZ en Supabase > SQL Editor, con el proyecto correcto seleccionado.
-- El script es idempotente: puede volver a ejecutarse si una sección quedó incompleta.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) AUDITORÍA: corrige el error crítico de register_sale_atomic
--    "column user_id of relation audit_log does not exist"
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  action text not null default 'unknown',
  table_name text not null default 'unknown',
  record_id text null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log add column if not exists user_id uuid;
alter table public.audit_log add column if not exists action text;
alter table public.audit_log add column if not exists table_name text;
alter table public.audit_log add column if not exists record_id text;
alter table public.audit_log add column if not exists details jsonb;
alter table public.audit_log add column if not exists created_at timestamptz;

alter table public.audit_log alter column action set default 'unknown';
alter table public.audit_log alter column table_name set default 'unknown';
alter table public.audit_log alter column details set default '{}'::jsonb;
alter table public.audit_log alter column created_at set default now();

-- Si una versión anterior usaba actor_id o created_by, conserva la autoría histórica.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='actor_id'
  ) then
    execute 'update public.audit_log set user_id = actor_id::uuid where user_id is null and actor_id is not null';
  elsif exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_log' and column_name='created_by'
  ) then
    execute 'update public.audit_log set user_id = created_by::uuid where user_id is null and created_by is not null';
  end if;
exception when invalid_text_representation then
  raise notice 'No se pudo convertir parte de la autoría histórica a UUID; los registros nuevos sí quedarán correctos.';
end $$;

create index if not exists audit_log_user_id_idx on public.audit_log(user_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

-- Asegura un valor automático para id, aunque la tabla antigua haya sido creada sin default.
do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema='public' and table_name='audit_log' and column_name='id';

  if v_type = 'uuid' then
    execute 'alter table public.audit_log alter column id set default gen_random_uuid()';
  elsif v_type in ('text', 'character varying') then
    execute 'alter table public.audit_log alter column id set default gen_random_uuid()::text';
  end if;
end $$;

-- PostgreSQL no permite cambiar el tipo de retorno de una función existente
-- mediante CREATE OR REPLACE. Se elimina únicamente esta firma y se reconstruye.
drop function if exists public.log_audit_event(text,text,text,jsonb);

create function public.log_audit_event(
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
  insert into public.audit_log(user_id, action, table_name, record_id, details, created_at)
  values (
    auth.uid(),
    coalesce(nullif(trim(p_action), ''), 'unknown'),
    coalesce(nullif(trim(p_table_name), ''), 'unknown'),
    nullif(trim(p_record_id), ''),
    coalesce(p_details, '{}'::jsonb),
    now()
  );
end;
$$;

revoke all on function public.log_audit_event(text,text,text,jsonb) from public;
grant execute on function public.log_audit_event(text,text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) FUNCIÓN AUXILIAR DE ADMINISTRADOR (nombre exclusivo para evitar sobrecargas antiguas)
-- ---------------------------------------------------------------------------
drop function if exists public.nv72_is_admin_20260709();

create function public.nv72_is_admin_20260709()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'administrador'
      and lower(coalesce(p.status, 'activo')) = 'activo'
  );
$$;

revoke all on function public.nv72_is_admin_20260709() from public;
grant execute on function public.nv72_is_admin_20260709() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) PERFIL COMERCIAL Y QR PERSONAL POR USUARIO
-- ---------------------------------------------------------------------------
create table if not exists public.commercial_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null default '',
  address text not null default '',
  location_label text not null default '',
  latitude double precision null,
  longitude double precision null,
  receipt_message text not null default '',
  qr_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.commercial_profiles add column if not exists business_name text not null default '';
alter table public.commercial_profiles add column if not exists address text not null default '';
alter table public.commercial_profiles add column if not exists location_label text not null default '';
alter table public.commercial_profiles add column if not exists latitude double precision;
alter table public.commercial_profiles add column if not exists longitude double precision;
alter table public.commercial_profiles add column if not exists receipt_message text not null default '';
alter table public.commercial_profiles add column if not exists qr_url text not null default '';
alter table public.commercial_profiles add column if not exists created_at timestamptz not null default now();
alter table public.commercial_profiles add column if not exists updated_at timestamptz not null default now();

alter table public.commercial_profiles enable row level security;

drop policy if exists nv72_commercial_profiles_select on public.commercial_profiles;
create policy nv72_commercial_profiles_select
on public.commercial_profiles for select
to authenticated
using (true);

drop policy if exists nv72_commercial_profiles_insert on public.commercial_profiles;
create policy nv72_commercial_profiles_insert
on public.commercial_profiles for insert
to authenticated
with check (user_id = auth.uid() or public.nv72_is_admin_20260709());

drop policy if exists nv72_commercial_profiles_update on public.commercial_profiles;
create policy nv72_commercial_profiles_update
on public.commercial_profiles for update
to authenticated
using (user_id = auth.uid() or public.nv72_is_admin_20260709())
with check (user_id = auth.uid() or public.nv72_is_admin_20260709());

drop policy if exists nv72_commercial_profiles_delete on public.commercial_profiles;
create policy nv72_commercial_profiles_delete
on public.commercial_profiles for delete
to authenticated
using (user_id = auth.uid() or public.nv72_is_admin_20260709());

-- Elimina posibles sobrecargas antiguas para que PostgREST no devuelva ambigüedad.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_my_commercial_profile_v7'
  loop
    execute format('drop function if exists %s', r.signature);
  end loop;
end $$;

create function public.update_my_commercial_profile_v7(
  p_business_name text,
  p_address text,
  p_location_label text,
  p_latitude double precision,
  p_longitude double precision,
  p_receipt_message text,
  p_qr_url text
)
returns public.commercial_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.commercial_profiles;
begin
  if auth.uid() is null then
    raise exception 'Sesión no autenticada';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitud fuera de rango';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitud fuera de rango';
  end if;

  insert into public.commercial_profiles (
    user_id, business_name, address, location_label, latitude, longitude,
    receipt_message, qr_url, created_at, updated_at
  ) values (
    auth.uid(),
    left(coalesce(p_business_name, ''), 140),
    left(coalesce(p_address, ''), 240),
    left(coalesce(p_location_label, ''), 240),
    p_latitude,
    p_longitude,
    left(coalesce(p_receipt_message, ''), 600),
    left(coalesce(p_qr_url, ''), 3000),
    now(), now()
  )
  on conflict (user_id) do update set
    business_name = excluded.business_name,
    address = excluded.address,
    location_label = excluded.location_label,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    receipt_message = excluded.receipt_message,
    qr_url = excluded.qr_url,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.update_my_commercial_profile_v7(text,text,text,double precision,double precision,text,text) from public;
grant execute on function public.update_my_commercial_profile_v7(text,text,text,double precision,double precision,text,text) to authenticated;

-- Bucket público: cada usuario solo puede escribir dentro de su propia carpeta UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-assets', 'payment-assets', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nv72_payment_assets_read on storage.objects;
create policy nv72_payment_assets_read
on storage.objects for select
to public
using (bucket_id = 'payment-assets');

drop policy if exists nv72_payment_assets_insert on storage.objects;
create policy nv72_payment_assets_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists nv72_payment_assets_update on storage.objects;
create policy nv72_payment_assets_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'payment-assets'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.nv72_is_admin_20260709())
)
with check (
  bucket_id = 'payment-assets'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.nv72_is_admin_20260709())
);

drop policy if exists nv72_payment_assets_delete on storage.objects;
create policy nv72_payment_assets_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'payment-assets'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.nv72_is_admin_20260709())
);

-- ---------------------------------------------------------------------------
-- 4) BUZÓN DIRECTO REPRESENTANTE ↔ ADMINISTRADOR
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id text primary key,
  type text not null default 'general',
  title text not null default 'Mensaje',
  body text not null default '',
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null default '',
  sender_role text not null default '',
  recipient_role text not null default 'Administrador',
  recipient_user_id uuid null references auth.users(id) on delete cascade,
  status text not null default 'unread',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages add column if not exists type text not null default 'general';
alter table public.messages add column if not exists title text not null default 'Mensaje';
alter table public.messages add column if not exists body text not null default '';
alter table public.messages add column if not exists sender_user_id uuid;
alter table public.messages add column if not exists sender_name text not null default '';
alter table public.messages add column if not exists sender_role text not null default '';
alter table public.messages add column if not exists recipient_role text not null default 'Administrador';
alter table public.messages add column if not exists recipient_user_id uuid;
alter table public.messages add column if not exists status text not null default 'unread';
alter table public.messages add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.messages add column if not exists created_at timestamptz not null default now();
alter table public.messages add column if not exists updated_at timestamptz not null default now();

create index if not exists messages_sender_user_idx on public.messages(sender_user_id, created_at desc);
create index if not exists messages_recipient_user_idx on public.messages(recipient_user_id, created_at desc);
create index if not exists messages_recipient_role_idx on public.messages(recipient_role, created_at desc);

alter table public.messages enable row level security;

drop policy if exists nv72_messages_select on public.messages;
create policy nv72_messages_select
on public.messages for select
to authenticated
using (
  sender_user_id = auth.uid()
  or recipient_user_id = auth.uid()
  or (lower(coalesce(recipient_role,'')) = 'administrador' and public.nv72_is_admin_20260709())
);

drop policy if exists nv72_messages_insert on public.messages;
create policy nv72_messages_insert
on public.messages for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and (
    recipient_user_id is not null
    or lower(coalesce(recipient_role,'')) = 'administrador'
  )
);

drop policy if exists nv72_messages_update on public.messages;
create policy nv72_messages_update
on public.messages for update
to authenticated
using (
  recipient_user_id = auth.uid()
  or (lower(coalesce(recipient_role,'')) = 'administrador' and public.nv72_is_admin_20260709())
)
with check (
  recipient_user_id = auth.uid()
  or (lower(coalesce(recipient_role,'')) = 'administrador' and public.nv72_is_admin_20260709())
);

commit;

-- VERIFICACIÓN RÁPIDA (solo lectura): debe devolver user_id y las tablas indicadas.
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='audit_log' and column_name='user_id';

select id, public, file_size_limit
from storage.buckets
where id='payment-assets';
