-- GOOD KING V0.8.0 · VERIFICACIÓN POSTERIOR A LA MIGRACIÓN

select version, description, applied_at
from public.schema_migrations
where version = '0.8.0';

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'sales' and column_name in ('estimated_cost','inventory_consumption'))
    or (table_name = 'expenses' and column_name = 'cash_session_id')
  )
order by table_name, column_name;

select policyname, tablename, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('inventory_items','inventory_movements','expenses')
order by tablename, policyname;

select
  (select count(*) from public.businesses) as businesses,
  (select count(*) from public.business_members) as members,
  (select count(*) from public.products) as products,
  (select count(*) from public.ingredients) as ingredients,
  (select count(*) from public.sales) as sales,
  (select count(*) from public.expenses) as expenses;

select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'apply_inventory_movement_v080';
