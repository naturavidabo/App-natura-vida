select 'app_records.module_key' as control, case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_records' and column_name='module_key') then 'OK' else 'FALTA' end as estado
union all select 'user_hierarchy', case when to_regclass('public.user_hierarchy') is not null then 'OK' else 'FALTA' end
union all select 'user_module_permissions', case when to_regclass('public.user_module_permissions') is not null then 'OK' else 'FALTA' end
union all select 'commercial_units', case when to_regclass('public.commercial_units') is not null then 'OK' else 'FALTA' end
union all select 'app_records index owner/store/module', case when exists(select 1 from pg_indexes where schemaname='public' and tablename='app_records' and indexname='idx_app_records_owner_store_module') then 'OK' else 'FALTA' end;
