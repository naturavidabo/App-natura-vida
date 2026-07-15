-- NATURA VIDA V7.3.0
-- Grupo de precios persistente para representantes.
-- Seguro para ejecutar más de una vez. No borra datos.

begin;

alter table public.profiles
  add column if not exists representative_price_group_id text;

create or replace function public.admin_set_representative_pricing_v730(
  p_user_id uuid,
  p_price_group_id text default null,
  p_discount_percent numeric default 0
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin_v7() then
    raise exception 'Solo el administrador puede configurar precios de representantes';
  end if;

  if p_discount_percent < 0 or p_discount_percent > 100 then
    raise exception 'El descuento debe estar entre 0 y 100';
  end if;

  if nullif(trim(coalesce(p_price_group_id, '')), '') is not null
     and not exists (select 1 from public.app_records ar
                     where ar.store_name = 'priceGroups'
                       and ar.record_id = trim(p_price_group_id)) then
    -- No bloquea grupos antiguos que todavía no estén en app_records compartidos.
    null;
  end if;

  update public.profiles
     set representative_price_group_id = nullif(trim(coalesce(p_price_group_id, '')), ''),
         representative_discount_percent = round(coalesce(p_discount_percent,0)::numeric, 2),
         updated_at = now()
   where id = p_user_id
   returning * into v_profile;

  if v_profile.id is null then
    raise exception 'No se encontró el representante';
  end if;

  perform public.log_audit_event(
    'representative:pricing',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'representative_price_group_id', v_profile.representative_price_group_id,
      'representative_discount_percent', v_profile.representative_discount_percent
    )
  );

  return v_profile;
end;
$$;

revoke all on function public.admin_set_representative_pricing_v730(uuid,text,numeric) from public, anon;
grant execute on function public.admin_set_representative_pricing_v730(uuid,text,numeric) to authenticated;

commit;
