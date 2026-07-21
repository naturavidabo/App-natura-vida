-- IMPORTACIÓN OPCIONAL Y CONTROLADA: GABRIELA ESPINOZA
-- 1) Ejecute primero la migración V8.2.0.
-- 2) Reemplace el UUID de abajo por el owner_user_id del administrador central.
-- 3) Confirme que el cliente ya existe en public.clients.
-- 4) Este script NO toca inventario ni inserta ventas nuevas en public.sales.

create or replace function public.nv_admin_import_gabriela_espinoza(p_owner_user_id uuid)
returns table(imported integer, total_paid numeric, total_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_client_name text;
  v_rows jsonb;
  v_row jsonb;
  v_count integer := 0;
  v_paid numeric := 0;
  v_balance numeric := 0;
begin
  select id::text, name into v_client_id, v_client_name
  from public.clients
  where owner_user_id = p_owner_user_id
    and lower(trim(name)) = lower('Gabriela Espinoza')
  order by updated_at desc nulls last
  limit 1;

  if v_client_id is null then
    raise exception 'No se encontró Gabriela Espinoza para el owner_user_id indicado';
  end if;

  v_rows := jsonb_build_array(
    jsonb_build_object('id','hist_mn_ge_20200920_01','historicalImportKey','mn_ge_20200920_01','clientId',v_client_id,'clientName',v_client_name,'originalDate','2020-09-20','originalSaleNumber','MN-GE-20200920-01','total',1243.20,'amountPaid',1000.00,'pendingBalance',243.20),
    jsonb_build_object('id','hist_mn_ge_20201228_01','historicalImportKey','mn_ge_20201228_01','clientId',v_client_id,'clientName',v_client_name,'originalDate','2020-12-28','originalSaleNumber','MN-GE-20201228-01','total',2030.00,'amountPaid',0.00,'pendingBalance',2030.00),
    jsonb_build_object('id','hist_mn_ge_20201228_02','historicalImportKey','mn_ge_20201228_02','clientId',v_client_id,'clientName',v_client_name,'originalDate','2020-12-28','originalSaleNumber','MN-GE-20201228-02','total',1694.00,'amountPaid',1095.00,'pendingBalance',599.00),
    jsonb_build_object('id','hist_mn_ge_20220912_01','historicalImportKey','mn_ge_20220912_01','clientId',v_client_id,'clientName',v_client_name,'originalDate','2022-09-12','originalSaleNumber','MN-GE-20220912-01','total',448.00,'amountPaid',0.00,'pendingBalance',448.00),
    jsonb_build_object('id','hist_mn_ge_20230518_01','historicalImportKey','mn_ge_20230518_01','clientId',v_client_id,'clientName',v_client_name,'originalDate','2023-05-18','originalSaleNumber','MN-GE-20230518-01','total',1570.00,'amountPaid',0.00,'pendingBalance',1570.00),
    jsonb_build_object('id','hist_mn_ge_20230518_02','historicalImportKey','mn_ge_20230518_02','clientId',v_client_id,'clientName',v_client_name,'originalDate','2023-05-18','originalSaleNumber','MN-GE-20230518-02','total',270.00,'amountPaid',0.00,'pendingBalance',270.00),
    jsonb_build_object('id','hist_mn_ge_20230518_03','historicalImportKey','mn_ge_20230518_03','clientId',v_client_id,'clientName',v_client_name,'originalDate','2023-05-18','originalSaleNumber','MN-GE-20230518-03','total',266.00,'amountPaid',0.00,'pendingBalance',266.00)
  );

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_row := v_row || jsonb_build_object(
      'documentNumber', v_row->>'originalSaleNumber',
      'date',(extract(epoch from ((v_row->>'originalDate')::date))*1000)::bigint,
      'dueDate', v_row->>'originalDate',
      'items', jsonb_build_array(jsonb_build_object('productName','Productos Natura Vida según venta original','qty',1,'unitPrice',(v_row->>'total')::numeric,'subtotal',(v_row->>'total')::numeric)),
      'paymentStatus', case when (v_row->>'amountPaid')::numeric > 0 then 'partial' else 'pending' end,
      'origin','Importado desde Mi Negocio','sourceSystem','Mi Negocio','historicalActive',true,
      'inventoryImpact',false,'stockAlreadyDelivered',true,'ownerUserId',p_owner_user_id::text,
      'createdAt',(extract(epoch from clock_timestamp())*1000)::bigint,'updatedAt',(extract(epoch from clock_timestamp())*1000)::bigint
    );
    insert into public.app_records(store_name,record_id,owner_user_id,visibility,payload)
    values('historicalReceivables',v_row->>'historicalImportKey',p_owner_user_id,'private',v_row)
    on conflict(store_name,record_id,owner_user_id) do update set payload=excluded.payload,updated_at=now();
    v_count:=v_count+1;v_paid:=v_paid+(v_row->>'amountPaid')::numeric;v_balance:=v_balance+(v_row->>'pendingBalance')::numeric;
  end loop;

  if round(v_paid,2) <> 2095.00 or round(v_balance,2) <> 5426.20 then
    raise exception 'Control de totales falló: pagado %, saldo %', v_paid, v_balance;
  end if;
  return query select v_count,round(v_paid,2),round(v_balance,2);
end;
$$;

revoke all on function public.nv_admin_import_gabriela_espinoza(uuid) from public, anon, authenticated;

-- EJEMPLO (reemplace el UUID):
-- select * from public.nv_admin_import_gabriela_espinoza('00000000-0000-0000-0000-000000000000'::uuid);
