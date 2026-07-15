-- NATURA VIDA V7.4.0 — PRODUCCIÓN, INSUMOS, LOTES Y COSTO REAL
-- Ejecutar en Supabase SQL Editor DESPUÉS de las migraciones V7.2 y V7.3.
-- El script es idempotente y no elimina ventas, productos, clientes ni historial.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) FUNCIÓN DE SEGURIDAD PROPIA DE V7.4
-- ---------------------------------------------------------------------------
drop function if exists public.nv74_is_admin_20260715();
create function public.nv74_is_admin_20260715()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'administrador'
      and lower(coalesce(p.status, 'activo')) = 'activo'
  );
$$;

revoke all on function public.nv74_is_admin_20260715() from public;
grant execute on function public.nv74_is_admin_20260715() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) INSUMOS Y MOVIMIENTOS
-- ---------------------------------------------------------------------------
create table if not exists public.raw_materials (
  id text primary key,
  name text not null,
  category text not null default 'Materia prima',
  unit text not null default 'unidad',
  stock numeric(18,4) not null default 0,
  average_cost numeric(18,6) not null default 0,
  min_stock numeric(18,4) not null default 0,
  supplier text not null default '',
  note text not null default '',
  active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_materials_stock_nonnegative check (stock >= 0),
  constraint raw_materials_average_cost_nonnegative check (average_cost >= 0),
  constraint raw_materials_min_stock_nonnegative check (min_stock >= 0)
);

create table if not exists public.raw_material_movements (
  id text primary key,
  material_id text not null references public.raw_materials(id) on delete restrict,
  movement_type text not null,
  quantity numeric(18,4) not null,
  unit_cost numeric(18,6) not null default 0,
  total_cost numeric(18,6) not null default 0,
  reference_id text not null default '',
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint raw_material_movements_quantity_positive check (quantity > 0),
  constraint raw_material_movements_type_valid check (movement_type in ('purchase','adjust_in','consume','adjust_out'))
);

create index if not exists raw_materials_active_idx on public.raw_materials(active, name);
create index if not exists raw_materials_stock_idx on public.raw_materials(stock, min_stock);
create index if not exists raw_material_movements_material_idx on public.raw_material_movements(material_id, created_at desc);
create index if not exists raw_material_movements_reference_idx on public.raw_material_movements(reference_id);

-- ---------------------------------------------------------------------------
-- 3) ÓRDENES Y LOTES DE PRODUCCIÓN
-- ---------------------------------------------------------------------------
create table if not exists public.production_orders (
  id text primary key,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null default '',
  status text not null default 'planned',
  planned_output numeric(18,4) not null default 0,
  output_unit text not null default 'unidades',
  presentation_ml numeric(18,4) not null default 0,
  planned_inputs jsonb not null default '[]'::jsonb,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_orders_status_valid check (status in ('planned','in_progress','completed','cancelled')),
  constraint production_orders_output_nonnegative check (planned_output >= 0)
);

create table if not exists public.production_batches (
  id text primary key,
  order_id text not null references public.production_orders(id) on delete restrict,
  lot_code text not null unique,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null default '',
  output_qty numeric(18,4) not null,
  output_unit text not null default 'unidades',
  presentation_ml numeric(18,4) not null default 0,
  actual_inputs jsonb not null default '[]'::jsonb,
  input_cost numeric(18,6) not null default 0,
  direct_cost numeric(18,6) not null default 0,
  total_cost numeric(18,6) not null default 0,
  unit_cost numeric(18,6) not null default 0,
  cost_per_ml numeric(18,8) not null default 0,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint production_batches_output_positive check (output_qty > 0),
  constraint production_batches_costs_nonnegative check (input_cost >= 0 and direct_cost >= 0 and total_cost >= 0 and unit_cost >= 0 and cost_per_ml >= 0)
);

create index if not exists production_orders_status_idx on public.production_orders(status, updated_at desc);
create index if not exists production_orders_product_idx on public.production_orders(product_id, created_at desc);
create index if not exists production_batches_order_idx on public.production_batches(order_id);
create index if not exists production_batches_product_idx on public.production_batches(product_id, created_at desc);
create index if not exists production_batches_created_idx on public.production_batches(created_at desc);

-- ---------------------------------------------------------------------------
-- 4) UPDATED_AT AUTOMÁTICO
-- ---------------------------------------------------------------------------
create or replace function public.nv74_touch_updated_at_20260715()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nv74_raw_materials_touch on public.raw_materials;
create trigger nv74_raw_materials_touch
before update on public.raw_materials
for each row execute function public.nv74_touch_updated_at_20260715();

drop trigger if exists nv74_production_orders_touch on public.production_orders;
create trigger nv74_production_orders_touch
before update on public.production_orders
for each row execute function public.nv74_touch_updated_at_20260715();

-- ---------------------------------------------------------------------------
-- 5) RLS: PRODUCCIÓN SOLO PARA ADMINISTRADOR ACTIVO
-- ---------------------------------------------------------------------------
alter table public.raw_materials enable row level security;
alter table public.raw_material_movements enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_batches enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['raw_materials','raw_material_movements','production_orders','production_batches']
  loop
    execute format('drop policy if exists nv74_%I_select on public.%I', t, t);
    execute format('drop policy if exists nv74_%I_insert on public.%I', t, t);
    execute format('drop policy if exists nv74_%I_update on public.%I', t, t);
    execute format('drop policy if exists nv74_%I_delete on public.%I', t, t);

    execute format(
      'create policy nv74_%I_select on public.%I for select to authenticated using (public.nv74_is_admin_20260715())',
      t, t
    );
    execute format(
      'create policy nv74_%I_insert on public.%I for insert to authenticated with check (public.nv74_is_admin_20260715())',
      t, t
    );
    execute format(
      'create policy nv74_%I_update on public.%I for update to authenticated using (public.nv74_is_admin_20260715()) with check (public.nv74_is_admin_20260715())',
      t, t
    );
    execute format(
      'create policy nv74_%I_delete on public.%I for delete to authenticated using (public.nv74_is_admin_20260715())',
      t, t
    );
  end loop;
end $$;

grant select, insert, update, delete on public.raw_materials to authenticated;
grant select, insert, update, delete on public.raw_material_movements to authenticated;
grant select, insert, update, delete on public.production_orders to authenticated;
grant select, insert, update, delete on public.production_batches to authenticated;

-- ---------------------------------------------------------------------------
-- 6) MOVIMIENTO ATÓMICO DE INSUMO
-- ---------------------------------------------------------------------------
drop function if exists public.register_raw_material_movement_v74(text,text,text,numeric,numeric,text,jsonb);
drop function if exists public.register_raw_material_movement_v74(text,text,text,numeric,numeric,text,jsonb,boolean);
create function public.register_raw_material_movement_v74(
  p_movement_id text,
  p_material_id text,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_note text default '',
  p_payload jsonb default '{}'::jsonb,
  p_register_expense boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_material public.raw_materials%rowtype;
  v_existing public.raw_material_movements%rowtype;
  v_new_stock numeric(18,4);
  v_new_average numeric(18,6);
  v_clean_cost numeric(18,6) := greatest(coalesce(p_unit_cost, 0), 0);
  v_total_cost numeric(18,6) := 0;
  v_expense_id text;
  v_expense_category text;
begin
  if auth.uid() is null or not public.nv74_is_admin_20260715() then
    raise exception 'Solo el administrador activo puede registrar movimientos de insumos';
  end if;
  if coalesce(trim(p_movement_id), '') = '' or coalesce(trim(p_material_id), '') = '' then
    raise exception 'Movimiento o insumo sin identificador';
  end if;
  if p_movement_type not in ('purchase','adjust_in','consume','adjust_out') then
    raise exception 'Tipo de movimiento no permitido';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select * into v_existing
  from public.raw_material_movements
  where id = p_movement_id;
  if found then
    select * into v_material from public.raw_materials where id = v_existing.material_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'material', to_jsonb(v_material), 'movement', to_jsonb(v_existing));
  end if;

  select * into v_material
  from public.raw_materials
  where id = p_material_id
  for update;
  if not found then raise exception 'El insumo no existe'; end if;

  v_new_stock := v_material.stock;
  v_new_average := v_material.average_cost;

  if p_movement_type in ('purchase','adjust_in') then
    v_new_stock := v_material.stock + p_quantity;
    if p_movement_type = 'purchase' then
      if v_clean_cost <= 0 then raise exception 'La compra necesita costo unitario'; end if;
      v_total_cost := p_quantity * v_clean_cost;
      if v_new_stock > 0 then
        v_new_average := ((v_material.stock * v_material.average_cost) + v_total_cost) / v_new_stock;
      end if;
    else
      v_total_cost := p_quantity * v_clean_cost;
    end if;
  else
    if v_material.stock < p_quantity then
      raise exception 'Stock insuficiente de %. Disponible: %, solicitado: %', v_material.name, v_material.stock, p_quantity;
    end if;
    v_new_stock := v_material.stock - p_quantity;
    v_clean_cost := v_material.average_cost;
    v_total_cost := p_quantity * v_clean_cost;
  end if;

  update public.raw_materials
  set stock = v_new_stock,
      average_cost = v_new_average,
      updated_at = now()
  where id = p_material_id
  returning * into v_material;

  insert into public.raw_material_movements(
    id, material_id, movement_type, quantity, unit_cost, total_cost,
    reference_id, note, payload, created_by, created_at
  ) values (
    p_movement_id, p_material_id, p_movement_type, p_quantity, v_clean_cost, v_total_cost,
    coalesce(p_payload->>'referenceId',''), left(coalesce(p_note,''), 800), coalesce(p_payload,'{}'::jsonb), auth.uid(), now()
  ) returning * into v_existing;

  -- La compra puede registrarse en el balance de egresos en la misma transacción.
  -- Se usa SQL dinámico para mantener compatibilidad con instalaciones donde app_records
  -- fue creada en una versión anterior.
  if p_movement_type = 'purchase' and coalesce(p_register_expense,true) and to_regclass('public.app_records') is not null then
    v_expense_id := 'exp_purchase_' || p_movement_id;
    v_expense_category := case
      when lower(v_material.category) like '%etiquet%' then 'Etiquetas'
      when lower(v_material.category) like '%envase%' or lower(v_material.category) like '%empaque%' then 'Envases'
      when lower(v_material.category) like '%materia%' or lower(v_material.category) like '%ingrediente%' then 'Materia prima'
      else 'Otros gastos'
    end;
    execute $sql$
      insert into public.app_records(store_name, record_id, owner_user_id, visibility, payload)
      values ('expenses', $1, auth.uid(), 'private', $2)
      on conflict (store_name, record_id, owner_user_id)
      do update set payload = excluded.payload, updated_at = now()
    $sql$
    using v_expense_id, jsonb_build_object(
      'id',v_expense_id,
      'category',v_expense_category,
      'name','Compra de ' || v_material.name,
      'totalCost',v_total_cost,
      'date',(extract(epoch from now()) * 1000)::bigint,
      'quantity',p_quantity,
      'unit',v_material.unit,
      'yieldQty',p_quantity,
      'yieldUnit',v_material.unit,
      'note',left(coalesce(p_note,''),800),
      'ownerUserId',auth.uid()::text,
      'createdAt',(extract(epoch from now()) * 1000)::bigint,
      'updatedAt',(extract(epoch from now()) * 1000)::bigint,
      'sourceMovementId',p_movement_id,
      'source','Natura Vida V7.4.0'
    );
  end if;

  perform public.log_audit_event(
    'raw_material_movement', 'raw_materials', p_material_id,
    jsonb_build_object('movementId',p_movement_id,'type',p_movement_type,'quantity',p_quantity,'newStock',v_new_stock)
  );

  return jsonb_build_object('ok', true, 'material', to_jsonb(v_material), 'movement', to_jsonb(v_existing), 'expenseId', v_expense_id);
end;
$$;

revoke all on function public.register_raw_material_movement_v74(text,text,text,numeric,numeric,text,jsonb,boolean) from public;
grant execute on function public.register_raw_material_movement_v74(text,text,text,numeric,numeric,text,jsonb,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) CIERRE ATÓMICO DE ORDEN: CONSUME INSUMOS, CREA LOTE Y AUMENTA STOCK
-- ---------------------------------------------------------------------------
drop function if exists public.complete_production_order_v74(text,text,text,jsonb,numeric,text,numeric,numeric,text);
create function public.complete_production_order_v74(
  p_order_id text,
  p_batch_id text,
  p_lot_code text,
  p_actual_inputs jsonb,
  p_output_qty numeric,
  p_output_unit text default 'unidades',
  p_presentation_ml numeric default 0,
  p_direct_cost numeric default 0,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.production_orders%rowtype;
  v_batch public.production_batches%rowtype;
  v_material public.raw_materials%rowtype;
  v_product record;
  v_item jsonb;
  v_material_id text;
  v_qty numeric(18,4);
  v_input_cost numeric(18,6) := 0;
  v_total_cost numeric(18,6);
  v_unit_cost numeric(18,6);
  v_cost_per_ml numeric(18,8) := 0;
  v_old_stock numeric(18,4);
  v_old_cost numeric(18,6);
  v_new_stock numeric(18,4);
  v_new_cost numeric(18,6);
  v_applied_inputs jsonb := '[]'::jsonb;
  v_seen jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.nv74_is_admin_20260715() then
    raise exception 'Solo el administrador activo puede completar producción';
  end if;
  if coalesce(trim(p_order_id),'')='' or coalesce(trim(p_batch_id),'')='' or coalesce(trim(p_lot_code),'')='' then
    raise exception 'Orden, lote o código sin identificador';
  end if;
  if coalesce(p_output_qty,0) <= 0 then raise exception 'La producción obtenida debe ser mayor que cero'; end if;
  if jsonb_typeof(coalesce(p_actual_inputs,'[]'::jsonb)) <> 'array' then raise exception 'Los insumos reales deben ser una lista'; end if;

  select * into v_batch from public.production_batches where id = p_batch_id;
  if found then
    return jsonb_build_object('ok',true,'duplicate',true,'batch',to_jsonb(v_batch));
  end if;

  select * into v_order
  from public.production_orders
  where id = p_order_id
  for update;
  if not found then raise exception 'La orden de producción no existe'; end if;
  if v_order.status = 'completed' then raise exception 'La orden ya fue completada'; end if;
  if v_order.status = 'cancelled' then raise exception 'La orden está cancelada'; end if;

  select id, name, stock, cost, payload
  into v_product
  from public.products
  where id = v_order.product_id
  for update;
  if not found then raise exception 'El producto terminado no existe'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_actual_inputs,'[]'::jsonb))
  loop
    v_material_id := coalesce(v_item->>'materialId', v_item->>'material_id', '');
    v_qty := coalesce((v_item->>'quantity')::numeric, 0);
    if trim(v_material_id) = '' or v_qty <= 0 then raise exception 'Insumo real inválido'; end if;
    if v_seen ? v_material_id then raise exception 'El insumo % está repetido en la orden', v_material_id; end if;
    v_seen := jsonb_set(v_seen, array[v_material_id], 'true'::jsonb, true);

    select * into v_material
    from public.raw_materials
    where id = v_material_id and active = true
    for update;
    if not found then raise exception 'No existe o está inactivo el insumo %', v_material_id; end if;
    if v_material.stock < v_qty then
      raise exception 'Stock insuficiente de %. Disponible: %, requerido: %', v_material.name, v_material.stock, v_qty;
    end if;

    update public.raw_materials
    set stock = stock - v_qty, updated_at = now()
    where id = v_material_id;

    insert into public.raw_material_movements(
      id, material_id, movement_type, quantity, unit_cost, total_cost,
      reference_id, note, payload, created_by, created_at
    ) values (
      p_batch_id || ':' || v_material_id,
      v_material_id,
      'consume',
      v_qty,
      v_material.average_cost,
      v_qty * v_material.average_cost,
      p_batch_id,
      'Consumo lote ' || p_lot_code,
      jsonb_build_object('orderId',p_order_id,'batchId',p_batch_id,'lotCode',p_lot_code),
      auth.uid(),
      now()
    );

    v_input_cost := v_input_cost + (v_qty * v_material.average_cost);
    v_applied_inputs := v_applied_inputs || jsonb_build_array(jsonb_build_object(
      'materialId', v_material.id,
      'materialName', v_material.name,
      'unit', v_material.unit,
      'quantity', v_qty,
      'unitCost', v_material.average_cost,
      'totalCost', v_qty * v_material.average_cost
    ));
  end loop;

  v_total_cost := v_input_cost + greatest(coalesce(p_direct_cost,0),0);
  v_unit_cost := v_total_cost / p_output_qty;
  if coalesce(p_presentation_ml,0) > 0 then
    v_cost_per_ml := v_unit_cost / p_presentation_ml;
  end if;

  v_old_stock := greatest(coalesce(v_product.stock,0),0);
  v_old_cost := greatest(coalesce(v_product.cost,0),0);
  v_new_stock := v_old_stock + p_output_qty;
  v_new_cost := case when v_new_stock > 0
    then ((v_old_stock * v_old_cost) + v_total_cost) / v_new_stock
    else v_unit_cost end;

  update public.products
  set stock = v_new_stock,
      cost = v_new_cost,
      payload = jsonb_set(
        coalesce(payload,'{}'::jsonb),
        '{lastProduction}',
        jsonb_build_object(
          'batchId',p_batch_id,'lotCode',p_lot_code,'outputQty',p_output_qty,
          'unitCost',v_unit_cost,'costPerMl',v_cost_per_ml,'completedAt',now()
        ),
        true
      ),
      updated_at = now()
  where id = v_order.product_id;

  insert into public.production_batches(
    id, order_id, lot_code, product_id, product_name, output_qty, output_unit,
    presentation_ml, actual_inputs, input_cost, direct_cost, total_cost,
    unit_cost, cost_per_ml, note, payload, created_by, created_at
  ) values (
    p_batch_id, p_order_id, left(p_lot_code,120), v_order.product_id,
    coalesce(nullif(v_order.product_name,''),v_product.name), p_output_qty,
    left(coalesce(nullif(p_output_unit,''),'unidades'),40), greatest(coalesce(p_presentation_ml,0),0),
    v_applied_inputs, v_input_cost, greatest(coalesce(p_direct_cost,0),0), v_total_cost,
    v_unit_cost, v_cost_per_ml, left(coalesce(p_note,''),1000),
    jsonb_build_object('plannedOutput',v_order.planned_output,'createdFrom','Natura Vida V7.4.0'),
    auth.uid(), now()
  ) returning * into v_batch;

  update public.production_orders
  set status = 'completed',
      completed_at = now(),
      updated_at = now(),
      payload = jsonb_set(coalesce(payload,'{}'::jsonb),'{batchId}',to_jsonb(p_batch_id),true)
  where id = p_order_id;

  perform public.log_audit_event(
    'production_completed', 'production_batches', p_batch_id,
    jsonb_build_object(
      'orderId',p_order_id,'productId',v_order.product_id,'lotCode',p_lot_code,
      'outputQty',p_output_qty,'inputCost',v_input_cost,'directCost',greatest(coalesce(p_direct_cost,0),0),
      'totalCost',v_total_cost,'unitCost',v_unit_cost,'newProductStock',v_new_stock,'newProductCost',v_new_cost
    )
  );

  return jsonb_build_object(
    'ok',true,
    'batch',to_jsonb(v_batch),
    'newProductStock',v_new_stock,
    'newProductCost',v_new_cost
  );
end;
$$;

revoke all on function public.complete_production_order_v74(text,text,text,jsonb,numeric,text,numeric,numeric,text) from public;
grant execute on function public.complete_production_order_v74(text,text,text,jsonb,numeric,text,numeric,numeric,text) to authenticated;

commit;
