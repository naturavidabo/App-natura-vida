-- GOOD KING · VERIFICACIÓN POSTERIOR

-- 1. Negocio y miembros
select b.name, b.slug, p.display_name, u.email, bm.role, bm.active
from public.business_members bm
join public.businesses b on b.id = bm.business_id
join auth.users u on u.id = bm.user_id
join public.profiles p on p.id = bm.user_id
order by bm.role;

-- 2. Tablas públicas y estado RLS
select n.nspname as schema_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 3. Políticas creadas
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 4. Categorías y configuración
select * from public.product_categories order by sort_order;
select setting_key, value from public.app_settings order by setting_key;

-- 5. Migración aplicada
select * from public.schema_migrations order by applied_at desc;
