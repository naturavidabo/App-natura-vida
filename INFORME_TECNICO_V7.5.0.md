-- Verificación Natura Vida V7.5.0
select 'representative_regional_profiles' as control, case when to_regclass('public.representative_regional_profiles') is not null then 'OK' else 'FALTA' end as resultado
union all
select 'regional_restock_requests', case when to_regclass('public.regional_restock_requests') is not null then 'OK' else 'FALTA' end
union all
select 'RLS representative_regional_profiles', case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='representative_regional_profiles' and c.relrowsecurity) then 'OK' else 'FALTA' end
union all
select 'RLS regional_restock_requests', case when exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='regional_restock_requests' and c.relrowsecurity) then 'OK' else 'FALTA' end;
