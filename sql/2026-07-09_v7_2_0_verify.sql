-- NATURA VIDA V7.2.0 — verificación posterior a la migración
-- Solo lectura. Ejecutar después de 2026-07-09_v7_2_0_stabilization.sql.

with checks as (
  select 'audit_log.user_id'::text as control,
         case when exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='audit_log' and column_name='user_id' and data_type='uuid'
         ) then 'OK' else 'FALTA' end as resultado

  union all
  select 'Función log_audit_event',
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='log_audit_event'
         ) then 'OK' else 'FALTA' end

  union all
  select 'Función register_sale_atomic',
         case when exists (
           select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname='register_sale_atomic'
         ) then 'OK' else 'FALTA' end

  union all
  select 'Tabla commercial_profiles',
         case when to_regclass('public.commercial_profiles') is not null then 'OK' else 'FALTA' end

  union all
  select 'Tabla messages',
         case when to_regclass('public.messages') is not null then 'OK' else 'FALTA' end

  union all
  select 'Bucket payment-assets',
         case when exists (
           select 1 from storage.buckets where id='payment-assets' and public=true
         ) then 'OK' else 'FALTA' end

  union all
  select 'RLS commercial_profiles',
         case when exists (
           select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='commercial_profiles' and c.relrowsecurity=true
         ) then 'OK' else 'FALTA' end

  union all
  select 'RLS messages',
         case when exists (
           select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relname='messages' and c.relrowsecurity=true
         ) then 'OK' else 'FALTA' end

  union all
  select 'Políticas payment-assets',
         case when (
           select count(*) from pg_policies
           where schemaname='storage' and tablename='objects' and policyname like 'nv72_payment_assets_%'
         ) >= 4 then 'OK' else 'FALTA' end
)
select control, resultado
from checks
order by control;
