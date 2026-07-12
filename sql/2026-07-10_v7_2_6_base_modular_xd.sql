-- NATURA VIDA V7.2.6 — BASE MODULAR XD
-- Ejecutar una sola vez en Supabase SQL Editor cuando quieras dejar registrada la matriz modular.
-- No borra datos. No modifica ventas. No toca stock.

begin;

-- 1) Campos seguros para app_records: permiten auditar dueño, alcance y módulo sin romper registros viejos.
alter table public.app_records add column if not exists module_key text;
alter table public.app_records add column if not exists parent_user_id uuid references auth.users(id) on delete set null;
alter table public.app_records add column if not exists region text;
alter table public.app_records add column if not exists scope text default 'private';

create index if not exists idx_app_records_owner_store_module on public.app_records(owner_user_id, store_name, module_key, updated_at desc);
create index if not exists idx_app_records_parent on public.app_records(parent_user_id, store_name, updated_at desc);
create index if not exists idx_app_records_region on public.app_records(region, store_name, updated_at desc);

-- 2) Jerarquía futura: admin -> representante regional -> vendedor/visitador/repartidor/bodega.
create table if not exists public.user_hierarchy (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null default 'supervises',
  region text not null default '',
  status text not null default 'active' check (status in ('active','inactive','blocked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(parent_user_id, child_user_id, relationship)
);

-- 3) Permisos por módulo. Por ahora queda preparado; la app actual sigue funcionando con roles existentes.
create table if not exists public.user_module_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, module_key)
);

-- 4) Unidades/regiones comerciales futuras.
create table if not exists public.commercial_units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null default '',
  manager_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5) Trigger updated_at genérico.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_hierarchy_updated_at on public.user_hierarchy;
create trigger trg_user_hierarchy_updated_at before update on public.user_hierarchy for each row execute function public.touch_updated_at();

drop trigger if exists trg_user_module_permissions_updated_at on public.user_module_permissions;
create trigger trg_user_module_permissions_updated_at before update on public.user_module_permissions for each row execute function public.touch_updated_at();

drop trigger if exists trg_commercial_units_updated_at on public.commercial_units;
create trigger trg_commercial_units_updated_at before update on public.commercial_units for each row execute function public.touch_updated_at();

alter table public.user_hierarchy enable row level security;
alter table public.user_module_permissions enable row level security;
alter table public.commercial_units enable row level security;

drop policy if exists user_hierarchy_read_modular on public.user_hierarchy;
create policy user_hierarchy_read_modular on public.user_hierarchy for select to authenticated
using (public.is_admin() or parent_user_id = auth.uid() or child_user_id = auth.uid());

drop policy if exists user_hierarchy_admin_write_modular on public.user_hierarchy;
create policy user_hierarchy_admin_write_modular on public.user_hierarchy for all to authenticated
using (public.is_admin() or parent_user_id = auth.uid())
with check (public.is_admin() or parent_user_id = auth.uid());

drop policy if exists module_permissions_read_modular on public.user_module_permissions;
create policy module_permissions_read_modular on public.user_module_permissions for select to authenticated
using (public.is_admin() or user_id = auth.uid());

drop policy if exists module_permissions_admin_write_modular on public.user_module_permissions;
create policy module_permissions_admin_write_modular on public.user_module_permissions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists commercial_units_read_modular on public.commercial_units;
create policy commercial_units_read_modular on public.commercial_units for select to authenticated
using (public.is_admin() or manager_user_id = auth.uid());

drop policy if exists commercial_units_admin_write_modular on public.commercial_units;
create policy commercial_units_admin_write_modular on public.commercial_units for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.user_hierarchy to authenticated;
grant select, insert, update, delete on public.user_module_permissions to authenticated;
grant select, insert, update, delete on public.commercial_units to authenticated;

commit;
