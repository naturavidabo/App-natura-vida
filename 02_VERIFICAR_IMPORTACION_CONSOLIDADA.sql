-- Verificación de la importación Mi Negocio
select
  case when count(*) = 69 then 'OK' else 'REVISAR' end as estado_ventas,
  count(*) as ventas,
  coalesce(sum(total),0) as total
from public.sales
where id like 'sale_mn_%';

select
  case when count(*) = 39 then 'OK' else 'REVISAR' end as estado_clientes,
  count(*) as clientes
from public.clients
where id like 'cli_mn_%';

select
  count(*) filter (where coalesce(payload->>'historicalImport','false')::boolean) as historicas,
  count(*) filter (where coalesce(payload->>'affectsStock','true')::boolean = false) as sin_impacto_stock
from public.sales
where id like 'sale_mn_%';

select id, client_name, total, sale_type, created_at
from public.sales
where id like 'sale_mn_%'
order by created_at desc
limit 10;
