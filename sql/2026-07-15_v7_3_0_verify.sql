-- Verificación Natura Vida V7.3.0
select
  case when exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name='representative_price_group_id'
  ) then 'OK' else 'FALTA' end as representative_price_group_id;

select
  case when to_regprocedure('public.admin_set_representative_pricing_v730(uuid,text,numeric)') is not null
  then 'OK' else 'FALTA' end as funcion_precios_representante;
