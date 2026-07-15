-- NATURA VIDA V7.5.0 — Gestión regional de representantes
-- Seguro para ejecutar más de una vez. No elimina datos.
begin;

create table if not exists public.representative_regional_profiles (
  id uuid primary key default gen_random_uuid(),
  representative_user_id uuid not null unique references public.profiles(id) on delete cascade,
  representative_name text not null default '',
  region_name text not null default '',
  city text not null default '',
  operational_status text not null default 'active' check (operational_status in ('active','suspended','inactive')),
  monthly_goal numeric(14,2) not null default 0 check (monthly_goal >= 0),
  debt_limit numeric(14,2) not null default 0 check (debt_limit >= 0),
  notes text not null default '',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.regional_restock_requests (
  id text primary key,
  request_code text not null unique,
  representative_user_id uuid not null references public.profiles(id) on delete cascade,
  representative_name text not null default '',
  items jsonb not null default '[]'::jsonb,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled')),
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_regional_profiles_region on public.representative_regional_profiles(region_name);
create index if not exists idx_restock_rep_status on public.regional_restock_requests(representative_user_id,status);

alter table public.representative_regional_profiles enable row level security;
alter table public.regional_restock_requests enable row level security;

drop policy if exists nv750_regional_select on public.representative_regional_profiles;
create policy nv750_regional_select on public.representative_regional_profiles for select to authenticated
using (public.is_admin_v7() or representative_user_id = auth.uid());
drop policy if exists nv750_regional_insert on public.representative_regional_profiles;
create policy nv750_regional_insert on public.representative_regional_profiles for insert to authenticated
with check (public.is_admin_v7());
drop policy if exists nv750_regional_update on public.representative_regional_profiles;
create policy nv750_regional_update on public.representative_regional_profiles for update to authenticated
using (public.is_admin_v7()) with check (public.is_admin_v7());

drop policy if exists nv750_restock_select on public.regional_restock_requests;
create policy nv750_restock_select on public.regional_restock_requests for select to authenticated
using (public.is_admin_v7() or representative_user_id = auth.uid());
drop policy if exists nv750_restock_insert on public.regional_restock_requests;
create policy nv750_restock_insert on public.regional_restock_requests for insert to authenticated
with check (representative_user_id = auth.uid());
drop policy if exists nv750_restock_update on public.regional_restock_requests;
create policy nv750_restock_update on public.regional_restock_requests for update to authenticated
using (public.is_admin_v7()) with check (public.is_admin_v7());

grant select,insert,update on public.representative_regional_profiles to authenticated;
grant select,insert,update on public.regional_restock_requests to authenticated;

commit;
