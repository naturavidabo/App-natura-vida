-- NATURA VIDA — MIGRACIÓN V6.6
-- Fase 1 de la Orden de Refactorización V6: nuevo modelo único de usuario.
-- Supabase pasa a ser la ÚNICA fuente de verdad para usuarios y perfiles.
-- Ejecutar en Supabase > SQL Editor > New query > Run.
-- No borra cuentas existentes — las normaliza a los nuevos valores.

-- 1) Columnas nuevas requeridas por la orden: email, último acceso.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists last_login_at timestamptz;

-- Un mismo correo no puede repetirse entre dos cuentas.
create unique index if not exists idx_profiles_email_unique on public.profiles (email) where email is not null;

-- 2) Normalización de ROL a los dos valores aprobados: administrador / representante.
--    (antes podía haber 'Administrador', 'Revendedor', 'Supervisor', etc.)
update public.profiles
set role = case
  when lower(role) like 'admin%' then 'administrador'
  else 'representante'
end
where role is not null and role not in ('administrador', 'representante');

alter table public.profiles alter column role set default 'representante';

-- 3) Normalización de ESTADO a los tres valores aprobados: pendiente / activo / bloqueado.
--    (antes era 'active' / 'inactive')
update public.profiles set status = 'activo' where status in ('active');
update public.profiles set status = 'bloqueado' where status in ('inactive', 'blocked');
update public.profiles set status = 'pendiente' where status not in ('activo', 'bloqueado', 'pendiente');

alter table public.profiles alter column status set default 'pendiente';

-- 4) Si ya existe al menos un administrador activo, se deja así. Si NO existe
--    ninguno (proyecto nuevo recién migrado), se promueve automáticamente al
--    primer usuario registrado para que alguien pueda empezar a aprobar al
--    resto — evita quedar bloqueados sin ningún administrador funcional.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'administrador' and status = 'activo') then
    update public.profiles set role = 'administrador', status = 'activo'
    where id = (select id from public.profiles order by created_at asc limit 1);
  end if;
end $$;

-- 5) Email obligatorio hacia adelante para cuentas nuevas (las existentes sin
--    email -- creadas con el correo sintético de versiones anteriores -- se
--    completan abajo a partir de auth.users, para que el campo nunca quede vacío).
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

comment on column public.profiles.email is 'Identificador principal de inicio de sesión (V6.6). Las cuentas creadas antes de esta versión pueden tener un correo sintético (...@natura-vida-app.local) que no recibe correo real; "Recuperar acceso" no funcionará para ellas hasta que actualicen su correo a uno real.';
