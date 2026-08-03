-- Natura Vida V8.3.4 — Centro Ejecutivo sincronizado
-- Ejecutar una sola vez en Supabase SQL Editor.
create table if not exists public.nv_ai_control_tasks (
  id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  detail text not null default '',
  priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  due_date date,
  area text not null default 'administration',
  source text not null default 'assistant',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id,id)
);
create index if not exists nv_ai_control_tasks_owner_status_idx on public.nv_ai_control_tasks(owner_user_id,status,due_date);
create table if not exists public.nv_ai_control_state (
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  state_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id,state_key)
);
alter table public.nv_ai_control_tasks enable row level security;
alter table public.nv_ai_control_state enable row level security;
drop policy if exists "nv_ai_control_tasks_select_own" on public.nv_ai_control_tasks;
create policy "nv_ai_control_tasks_select_own" on public.nv_ai_control_tasks for select to authenticated using (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_tasks_insert_own" on public.nv_ai_control_tasks;
create policy "nv_ai_control_tasks_insert_own" on public.nv_ai_control_tasks for insert to authenticated with check (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_tasks_update_own" on public.nv_ai_control_tasks;
create policy "nv_ai_control_tasks_update_own" on public.nv_ai_control_tasks for update to authenticated using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_tasks_delete_own" on public.nv_ai_control_tasks;
create policy "nv_ai_control_tasks_delete_own" on public.nv_ai_control_tasks for delete to authenticated using (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_state_select_own" on public.nv_ai_control_state;
create policy "nv_ai_control_state_select_own" on public.nv_ai_control_state for select to authenticated using (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_state_insert_own" on public.nv_ai_control_state;
create policy "nv_ai_control_state_insert_own" on public.nv_ai_control_state for insert to authenticated with check (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_state_update_own" on public.nv_ai_control_state;
create policy "nv_ai_control_state_update_own" on public.nv_ai_control_state for update to authenticated using (owner_user_id=auth.uid()) with check (owner_user_id=auth.uid());
drop policy if exists "nv_ai_control_state_delete_own" on public.nv_ai_control_state;
create policy "nv_ai_control_state_delete_own" on public.nv_ai_control_state for delete to authenticated using (owner_user_id=auth.uid());
grant select,insert,update,delete on public.nv_ai_control_tasks to authenticated;
grant select,insert,update,delete on public.nv_ai_control_state to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nv_ai_control_tasks') then alter publication supabase_realtime add table public.nv_ai_control_tasks; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nv_ai_control_state') then alter publication supabase_realtime add table public.nv_ai_control_state; end if;
end $$;
notify pgrst, 'reload schema';
