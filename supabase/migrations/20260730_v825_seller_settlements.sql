-- NATURA VIDA V8.2.7 — Rendiciones de caja y recarga de esquema
-- Rendición de caja de vendedores y verificación manual de cobros digitales.
-- Ejecutar una sola vez en SQL Editor. No modifica ventas, pagos ni inventario existentes.

begin;

create table if not exists public.nv_seller_settlements (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  stock_owner_user_id uuid null references auth.users(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  cash_collected numeric(14,2) not null default 0 check (cash_collected >= 0),
  cash_delivered numeric(14,2) not null check (cash_delivered > 0),
  balance_after numeric(14,2) not null default 0 check (balance_after >= 0),
  digital_collected numeric(14,2) not null default 0 check (digital_collected >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  confirmed_by uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nv_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('sale','payment')),
  source_id text not null,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  method text not null check (method in ('qr','transfer','deposit','other')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  provider text not null default 'manual',
  provider_reference text not null default '',
  verified_by uuid null references auth.users(id) on delete set null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_kind, source_id)
);

create or replace function public.nv_can_manage_seller_v825(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = p_seller
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and coalesce(me.status,'activo') = 'activo'
        and (
          me.commercial_role = 'central_admin'
          or exists (
            select 1 from public.profiles seller
            where seller.id = p_seller
              and seller.manager_user_id = auth.uid()
          )
        )
    );
$$;

revoke all on function public.nv_can_manage_seller_v825(uuid) from public, anon;
grant execute on function public.nv_can_manage_seller_v825(uuid) to authenticated;

create or replace function public.nv_can_approve_seller_v825(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and coalesce(me.status,'activo') = 'activo'
      and (
        me.commercial_role = 'central_admin'
        or exists (
          select 1 from public.profiles seller
          where seller.id = p_seller
            and seller.manager_user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.nv_can_approve_seller_v825(uuid) from public, anon;
grant execute on function public.nv_can_approve_seller_v825(uuid) to authenticated;

alter table public.nv_seller_settlements enable row level security;
alter table public.nv_payment_verifications enable row level security;

drop policy if exists nv825_settlements_select on public.nv_seller_settlements;
create policy nv825_settlements_select on public.nv_seller_settlements
for select to authenticated using (public.nv_can_manage_seller_v825(seller_user_id));

drop policy if exists nv825_settlements_insert on public.nv_seller_settlements;
create policy nv825_settlements_insert on public.nv_seller_settlements
for insert to authenticated with check (created_by = auth.uid() and public.nv_can_manage_seller_v825(seller_user_id));

drop policy if exists nv825_settlements_update on public.nv_seller_settlements;
create policy nv825_settlements_update on public.nv_seller_settlements
for update to authenticated using (public.nv_can_approve_seller_v825(seller_user_id))
with check (public.nv_can_approve_seller_v825(seller_user_id));

drop policy if exists nv825_verifications_select on public.nv_payment_verifications;
create policy nv825_verifications_select on public.nv_payment_verifications
for select to authenticated using (public.nv_can_manage_seller_v825(seller_user_id));

drop policy if exists nv825_verifications_insert on public.nv_payment_verifications;
create policy nv825_verifications_insert on public.nv_payment_verifications
for insert to authenticated with check (public.nv_can_approve_seller_v825(seller_user_id));

drop policy if exists nv825_verifications_update on public.nv_payment_verifications;
create policy nv825_verifications_update on public.nv_payment_verifications
for update to authenticated using (public.nv_can_approve_seller_v825(seller_user_id))
with check (public.nv_can_approve_seller_v825(seller_user_id));

grant select, insert, update on public.nv_seller_settlements to authenticated;
grant select, insert, update on public.nv_payment_verifications to authenticated;

create index if not exists nv825_settlement_seller_date_idx on public.nv_seller_settlements(seller_user_id, created_at desc);
create index if not exists nv825_verification_seller_date_idx on public.nv_payment_verifications(seller_user_id, created_at desc);

notify pgrst, 'reload schema';

commit;
