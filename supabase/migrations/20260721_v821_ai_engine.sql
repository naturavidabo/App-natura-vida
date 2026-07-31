-- NATURA VIDA V8.2.1 — Control de uso y auditoría mínima del motor IA.
-- No almacena preguntas, respuestas, teléfonos, direcciones ni datos comerciales completos.
begin;

create table if not exists public.nv_ai_daily_usage (
  user_id uuid not null,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  last_request_at timestamptz,
  primary key (user_id, usage_date)
);
alter table public.nv_ai_daily_usage enable row level security;
drop policy if exists "nv_ai_usage_select_own" on public.nv_ai_daily_usage;
create policy "nv_ai_usage_select_own" on public.nv_ai_daily_usage for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.nv_ai_daily_usage from authenticated, anon;
grant select on public.nv_ai_daily_usage to authenticated;

create table if not exists public.nv_ai_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  engine text not null,
  model text,
  status text not null,
  context_label text,
  question_hash text,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists nv_ai_audit_user_created_idx on public.nv_ai_audit(user_id, created_at desc);
alter table public.nv_ai_audit enable row level security;
drop policy if exists "nv_ai_audit_select_own" on public.nv_ai_audit;
create policy "nv_ai_audit_select_own" on public.nv_ai_audit for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.nv_ai_audit from authenticated, anon;
grant select on public.nv_ai_audit to authenticated;

create or replace function public.nv_ai_usage_status(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_role text; v_used integer:=0; v_limit integer:=greatest(1,least(200,coalesce(p_limit,30)));
begin
  if v_user is null then raise exception 'Sesión no autenticada'; end if;
  select commercial_role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') <> 'central_admin' then raise exception 'Solo el administrador central puede usar el motor IA'; end if;
  select request_count into v_used from public.nv_ai_daily_usage where user_id=v_user and usage_date=current_date;
  v_used:=coalesce(v_used,0);
  return jsonb_build_object('used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'date',current_date);
end; $$;

create or replace function public.nv_consume_ai_request(p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_role text; v_used integer; v_limit integer:=greatest(1,least(200,coalesce(p_limit,30)));
begin
  if v_user is null then raise exception 'Sesión no autenticada'; end if;
  select commercial_role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') <> 'central_admin' then raise exception 'Solo el administrador central puede usar el motor IA'; end if;
  insert into public.nv_ai_daily_usage(user_id,usage_date,request_count,last_request_at)
  values(v_user,current_date,1,now())
  on conflict(user_id,usage_date) do update set request_count=public.nv_ai_daily_usage.request_count+1,last_request_at=now()
  returning request_count into v_used;
  if v_used > v_limit then
    update public.nv_ai_daily_usage set request_count=v_limit where user_id=v_user and usage_date=current_date;
    raise exception 'Se alcanzó el límite diario de % consultas IA',v_limit;
  end if;
  return jsonb_build_object('used',v_used,'limit',v_limit,'remaining',greatest(0,v_limit-v_used),'date',current_date);
end; $$;

create or replace function public.nv_log_ai_event(p_engine text,p_model text,p_status text,p_context text,p_question_hash text,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_role text;
begin
  if v_user is null then raise exception 'Sesión no autenticada'; end if;
  select commercial_role into v_role from public.profiles where id=v_user;
  if coalesce(v_role,'') <> 'central_admin' then raise exception 'Operación no autorizada'; end if;
  insert into public.nv_ai_audit(user_id,engine,model,status,context_label,question_hash,metadata)
  values(v_user,left(coalesce(p_engine,'unknown'),30),left(coalesce(p_model,''),80),left(coalesce(p_status,'unknown'),30),left(coalesce(p_context,''),100),left(coalesce(p_question_hash,''),80),coalesce(p_metadata,'{}'::jsonb));
end; $$;

revoke all on function public.nv_ai_usage_status(integer) from public, anon;
revoke all on function public.nv_consume_ai_request(integer) from public, anon;
revoke all on function public.nv_log_ai_event(text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.nv_ai_usage_status(integer) to authenticated;
grant execute on function public.nv_consume_ai_request(integer) to authenticated;
grant execute on function public.nv_log_ai_event(text,text,text,text,text,jsonb) to authenticated;

commit;
