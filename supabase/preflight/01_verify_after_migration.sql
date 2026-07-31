-- VERIFICACIÓN POSTERIOR A LA MIGRACIÓN
select to_regclass('public.nv_financial_document_sequences') as sequence_table;
select proname from pg_proc where proname in ('nv_next_financial_document_number','nv_import_historical_receivable');
select store_name, count(*) from public.app_records
where store_name in ('receivablePayments','historicalReceivables','financialDocuments','paymentPlans')
group by store_name order by store_name;
-- La siguiente función requiere sesión autenticada desde la aplicación; no la ejecute en SQL editor:
-- select public.nv_next_financial_document_number('EC');


-- V8.2.9: verificación de funciones críticas de venta y recibo (solo lectura)
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('register_sale_atomic','nv801_register_linked_sale_atomic','next_document_number')
order by p.proname;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='sales'
order by ordinal_position;
