-- VERIFICAR IMPORTACIÓN CONSOLIDADA MI NEGOCIO
-- Esperado después de ejecutar 01_IMPORTAR_MI_NEGOCIO_CONSOLIDADO_EN_SUPABASE.sql:
--   ventas Mi Negocio: 103
--   total Mi Negocio: 99797.50
--   ventas backup celular 2: 34
--   total backup celular 2: 27047.00
--   cuentas por cobrar detectadas en backup celular 2: 0

with resumen as (
  select
    count(*) filter (where id like 'sale_mn_%') as ventas_mi_negocio,
    coalesce(sum(total) filter (where id like 'sale_mn_%'),0) as total_mi_negocio,
    count(*) filter (where id like 'sale_mn_b2_%') as ventas_backup_celular_2,
    coalesce(sum(total) filter (where id like 'sale_mn_b2_%'),0) as total_backup_celular_2,
    count(*) filter (
      where id like 'sale_mn_%'
      and coalesce(payload->>'affectsStock','false') = 'false'
    ) as ventas_sin_impacto_stock,
    count(*) filter (
      where id like 'sale_mn_b2_%'
      and coalesce(payload->>'receivable','false') = 'true'
    ) as cuentas_por_cobrar_backup_2
  from public.sales
)
select
  case when ventas_mi_negocio = 103 then 'OK' else 'REVISAR' end as ventas_mi_negocio_estado,
  ventas_mi_negocio,
  case when round(total_mi_negocio,2) = 99797.50 then 'OK' else 'REVISAR' end as total_mi_negocio_estado,
  total_mi_negocio,
  case when ventas_backup_celular_2 = 34 then 'OK' else 'REVISAR' end as backup_2_ventas_estado,
  ventas_backup_celular_2,
  case when round(total_backup_celular_2,2) = 27047.00 then 'OK' else 'REVISAR' end as backup_2_total_estado,
  total_backup_celular_2,
  case when ventas_sin_impacto_stock = ventas_mi_negocio then 'OK' else 'REVISAR' end as stock_estado,
  ventas_sin_impacto_stock,
  case when cuentas_por_cobrar_backup_2 = 0 then 'OK' else 'REVISAR' end as cuentas_por_cobrar_backup_2_estado,
  cuentas_por_cobrar_backup_2
from resumen;

select
  client_name,
  count(*) as compras,
  sum(total) as total_comprado
from public.sales
where id like 'sale_mn_%'
group by client_name
order by total_comprado desc
limit 15;
