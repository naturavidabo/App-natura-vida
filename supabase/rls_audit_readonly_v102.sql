-- Natura Vida | Auditoría RLS y permisos (solo lectura)
-- Fase 1.2. No modifica datos, roles, políticas ni funciones.
-- Ejecutar solamente con una cuenta administradora autorizada en el SQL Editor.
-- ATENCIÓN: las consultas revelan metadatos de seguridad; no publicar su salida.
-- Resultado 1: tablas visibles y controles de acceso
select n.nspname as esquema, c.relname as tabla, c.relrowsecurity as rls_habilitado,
       c.relforcerowsecurity as rls_forzado,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_puede_leer,
       has_table_privilege('anon', c.oid, 'INSERT') as anon_puede_insertar,
       has_table_privilege('authenticated', c.oid, 'SELECT') as autenticado_puede_leer,
       has_table_privilege('authenticated', c.oid, 'UPDATE') as autenticado_puede_actualizar,
       (select count(*) from pg_policy pol where pol.polrelid = c.oid) as numero_politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
order by c.relname;

-- Resultado 2: reglas exactas de SELECT, INSERT, UPDATE y DELETE
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as condicion_using, with_check as condicion_with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Resultado 3: vistas expuestas y si respetan permisos del invocador
select n.nspname as esquema, c.relname as vista,
       c.relkind as tipo_vista,
       c.reloptions as opciones_seguridad,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_puede_leer,
       has_table_privilege('authenticated', c.oid, 'SELECT') as autenticado_puede_leer
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m')
order by c.relname;

-- Resultado 4: funciones privilegiadas invocables desde el navegador
select n.nspname as esquema,
       p.proname as funcion,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as ejecutable_por_anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as ejecutable_por_autenticado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosecdef or p.proname in
    ('register_sale_atomic','nv801_register_linked_sale_atomic',
     'nv801_assign_user_role','admin_approve_purchase_order_v7'))
order by p.prosecdef desc, p.proname;

-- Resultado 5: advertencias de políticas posiblemente demasiado amplias
-- Es un filtro orientativo, NO es una conclusión de vulnerabilidad.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (
    trim(coalesce(qual,'')) in ('true','(true)')
    or trim(coalesce(with_check,'')) in ('true','(true)')
  )
order by tablename, policyname;
