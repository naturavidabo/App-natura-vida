-- PREVUELO DE SOLO LECTURA — ejecutar antes de V8.2.0
select 'clients' as source, count(*) as rows from public.clients
union all select 'sales', count(*) from public.sales
union all select 'app_records', count(*) from public.app_records
union all select 'receivablePayments', count(*) from public.app_records where store_name='receivablePayments'
union all select 'historicalReceivables', count(*) from public.app_records where store_name='historicalReceivables'
union all select 'financialDocuments', count(*) from public.app_records where store_name='financialDocuments';

select id, name, phone, owner_user_id, created_at, updated_at
from public.clients
where lower(name) like '%gabriela%espinoza%'
order by updated_at desc nulls last;
