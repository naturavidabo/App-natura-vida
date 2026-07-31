-- GOOD KING V0.7.0 · VERIFICACIÓN DE RECETAS Y LISTA DE MERCADO
-- Consulta de solo lectura. No modifica información.

select 'recipes' as object_name, to_regclass('public.recipes') is not null as exists
union all select 'recipe_items', to_regclass('public.recipe_items') is not null
union all select 'market_lists', to_regclass('public.market_lists') is not null
union all select 'market_list_items', to_regclass('public.market_list_items') is not null
union all select 'ingredients', to_regclass('public.ingredients') is not null
union all select 'inventory_items', to_regclass('public.inventory_items') is not null;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('recipes','recipe_items','market_lists','market_list_items')
order by c.relname;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('recipes','recipe_items','market_lists','market_list_items')
order by tablename, policyname;

select
  (select count(*) from public.recipes where deleted_at is null) as active_recipes,
  (select count(*) from public.recipe_items where deleted_at is null) as active_recipe_items,
  (select count(*) from public.market_lists where deleted_at is null) as market_lists,
  (select count(*) from public.market_list_items where deleted_at is null) as market_list_items;
