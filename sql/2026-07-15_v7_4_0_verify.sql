-- VERIFICACIÓN NATURA VIDA V7.4.0
-- Ejecutar después de 2026-07-15_v7_4_0_production.sql.

select 'Tabla raw_materials' as control, to_regclass('public.raw_materials') is not null as ok
union all
select 'Tabla raw_material_movements', to_regclass('public.raw_material_movements') is not null
union all
select 'Tabla production_orders', to_regclass('public.production_orders') is not null
union all
select 'Tabla production_batches', to_regclass('public.production_batches') is not null
union all
select 'RPC movimiento de insumo', to_regprocedure('public.register_raw_material_movement_v74(text,text,text,numeric,numeric,text,jsonb,boolean)') is not null
union all
select 'RPC cierre de producción', to_regprocedure('public.complete_production_order_v74(text,text,text,jsonb,numeric,text,numeric,numeric,text)') is not null
union all
select 'RLS raw_materials', coalesce((select relrowsecurity from pg_class where oid='public.raw_materials'::regclass),false)
union all
select 'RLS production_orders', coalesce((select relrowsecurity from pg_class where oid='public.production_orders'::regclass),false)
union all
select 'RLS production_batches', coalesce((select relrowsecurity from pg_class where oid='public.production_batches'::regclass),false);

select
  (select count(*) from public.raw_materials) as insumos,
  (select count(*) from public.raw_material_movements) as movimientos,
  (select count(*) from public.production_orders) as ordenes,
  (select count(*) from public.production_batches) as lotes;
