-- VERIFICACIÓN POSTERIOR A LA MIGRACIÓN
select to_regclass('public.nv_financial_document_sequences') as sequence_table;
select proname from pg_proc where proname in ('nv_next_financial_document_number','nv_import_historical_receivable');
select store_name, count(*) from public.app_records
where store_name in ('receivablePayments','historicalReceivables','financialDocuments','paymentPlans')
group by store_name order by store_name;
-- La siguiente función requiere sesión autenticada desde la aplicación; no la ejecute en SQL editor:
-- select public.nv_next_financial_document_number('EC');
