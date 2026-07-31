-- GOOD KING V0.8.0 · MIGRACIÓN DE CONSOLIDACIÓN
-- Ejecutar una sola vez en Supabase SQL Editor después del esquema V0.5.1.
-- Es idempotente: puede volver a ejecutarse si una consulta se interrumpe.

begin;

alter table public.sales
  add column if not exists estimated_cost numeric(12,2) not null default 0,
  add column if not exists inventory_consumption jsonb not null default '[]'::jsonb;

alter table public.expenses
  add column if not exists cash_session_id uuid references public.cash_sessions(id) on delete set null;

create index if not exists expenses_cash_session_idx
  on public.expenses(business_id, cash_session_id, expense_date desc);

create index if not exists sales_cost_report_idx
  on public.sales(business_id, business_date desc, status, estimated_cost);

-- La compra desde la aplicación usa cash_register para efectivo de caja.
alter table public.purchases drop constraint if exists purchases_payment_source_check;
alter table public.purchases
  add constraint purchases_payment_source_check
  check (payment_source in ('cash_register','external','credit'));

-- Normaliza los tipos que utiliza la aplicación local-first.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in ('purchase','sale','adjustment','waste','internal_use','reversal'));

-- El ayudante puede vender. El consumo automático de inventario generado por una
-- venta debe poder sincronizarse, aunque el ayudante no vea el módulo administrativo.
drop policy if exists inventory_items_write on public.inventory_items;
create policy inventory_items_write on public.inventory_items for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists inventory_movements_write on public.inventory_movements;
create policy inventory_movements_write on public.inventory_movements for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

-- Aplicación idempotente de movimientos: evita perder stock cuando dos
-- dispositivos sincronizan ventas fuera de línea al mismo tiempo.
create or replace function public.apply_inventory_movement_v080(
  p_id uuid,
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default 0,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_detail text default null,
  p_device_id uuid default null,
  p_created_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'Usuario sin acceso al negocio';
  end if;

  if not exists (
    select 1 from public.inventory_items
    where id = p_inventory_item_id and business_id = p_business_id
  ) then
    raise exception 'No existe el registro de inventario %', p_inventory_item_id;
  end if;

  insert into public.inventory_movements(
    id, business_id, inventory_item_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, detail, created_by, device_id, created_at, updated_at
  ) values (
    p_id, p_business_id, p_inventory_item_id, p_movement_type, p_quantity,
    coalesce(p_unit_cost,0), p_reference_type, p_reference_id, p_detail,
    auth.uid(), p_device_id, coalesce(p_created_at,now()), now()
  ) on conflict (id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.inventory_items
    set theoretical_quantity = theoretical_quantity + p_quantity,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_inventory_item_id
      and business_id = p_business_id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.apply_inventory_movement_v080(uuid,uuid,uuid,text,numeric,numeric,text,uuid,text,uuid,timestamptz) from public;
grant execute on function public.apply_inventory_movement_v080(uuid,uuid,uuid,text,numeric,numeric,text,uuid,text,uuid,timestamptz) to authenticated;

insert into public.schema_migrations(version, description)
values ('0.8.0', 'Gastos vinculados a caja, costo de venta, consumo de inventario y políticas operativas')
on conflict (version) do update
set description = excluded.description,
    applied_at = now();

commit;
