-- GOOD KING · BOOTSTRAP INICIAL
-- Antes de ejecutar:
-- 1) Cree los usuarios en Authentication > Users.
-- 2) Reemplace los correos de ejemplo por los correos reales.

begin;

insert into public.businesses (name, slug, timezone, currency_code)
values ('Good King', 'good-king', 'America/La_Paz', 'BOB')
on conflict (slug) do update
set name = excluded.name,
    timezone = excluded.timezone,
    currency_code = excluded.currency_code;

DO $$
DECLARE
  v_business_id uuid;
  v_admin_id uuid;
  v_owner_id uuid;
  v_helper_id uuid;
BEGIN
  select id into v_business_id from public.businesses where slug = 'good-king';

  -- Correos configurados para Good King. El ayudante se incorporará cuando exista su usuario.
  select id into v_admin_id from auth.users where lower(email) = lower('goodking.bo@gmail.com');
  select id into v_owner_id from auth.users where lower(email) = lower('gloria.msg27@gmail.com');
  select id into v_helper_id from auth.users where lower(email) = lower('AYUDANTE_NO_CREADO@goodking.local');

  if v_admin_id is null then
    raise exception 'No se encontró el usuario administrador. Revise el correo.';
  end if;
  if v_owner_id is null then
    raise exception 'No se encontró el usuario de la propietaria. Revise el correo.';
  end if;

  insert into public.business_members (business_id, user_id, role, active)
  values (v_business_id, v_admin_id, 'admin', true)
  on conflict (business_id, user_id) do update set role='admin', active=true;

  insert into public.business_members (business_id, user_id, role, active)
  values (v_business_id, v_owner_id, 'owner', true)
  on conflict (business_id, user_id) do update set role='owner', active=true;

  if v_helper_id is not null then
    insert into public.business_members (business_id, user_id, role, active)
    values (v_business_id, v_helper_id, 'helper', true)
    on conflict (business_id, user_id) do update set role='helper', active=true;
  end if;
END $$;

-- Categorías oficiales de venta
insert into public.product_categories (business_id, name, code, sort_order)
select b.id, x.name, x.code, x.sort_order
from public.businesses b
cross join (values
  ('Menú', 'menu', 1),
  ('Bebidas', 'drinks', 2),
  ('Extras', 'extras', 3)
) as x(name, code, sort_order)
where b.slug = 'good-king'
on conflict (business_id, code) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    active = true;

-- Configuración inicial del negocio
insert into public.app_settings (business_id, setting_key, value)
select id, 'business_profile', jsonb_build_object(
  'commercial_name', 'Good King',
  'subtitle', '',
  'currency', 'BOB',
  'timezone', 'America/La_Paz',
  'closed_day', 'tuesday',
  'opening_time', '12:00',
  'closing_time', '00:00'
)
from public.businesses where slug = 'good-king'
on conflict (business_id, setting_key) do update set value = excluded.value;

insert into public.app_settings (business_id, setting_key, value)
select id, 'sales_rules', jsonb_build_object(
  'daily_order_reset', true,
  'default_order_type', 'table',
  'allowed_order_types', jsonb_build_array('table','takeaway'),
  'allowed_payment_methods', jsonb_build_array('cash','qr'),
  'credit_requires_authorized_customer', true
)
from public.businesses where slug = 'good-king'
on conflict (business_id, setting_key) do update set value = excluded.value;

commit;
