-- NATURA VIDA V8.2.0
-- Estados de cuenta, deudas activas y documentos de cobro.
-- Ejecutar DESPUÉS de crear un respaldo del proyecto.
-- Esta migración no modifica ventas ni inventario existentes.

begin;

create table if not exists public.nv_financial_document_sequences (
  owner_user_id uuid not null,
  prefix text not null check (prefix ~ '^[A-Z]{2,5}$'),
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, prefix)
);

alter table public.nv_financial_document_sequences enable row level security;

drop policy if exists "nv_financial_sequences_select_own" on public.nv_financial_document_sequences;
create policy "nv_financial_sequences_select_own"
on public.nv_financial_document_sequences
for select
to authenticated
using (owner_user_id = auth.uid());

-- La escritura normal se realiza únicamente mediante la función segura.
revoke insert, update, delete on public.nv_financial_document_sequences from authenticated, anon;
grant select on public.nv_financial_document_sequences to authenticated;

create or replace function public.nv_next_financial_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_prefix text := upper(regexp_replace(coalesce(p_prefix, 'DOC'), '[^A-Za-z]', '', 'g'));
  v_next bigint;
begin
  if v_user is null then
    raise exception 'Sesión no autenticada';
  end if;
  if length(v_prefix) < 2 or length(v_prefix) > 5 then
    raise exception 'Prefijo documental inválido';
  end if;

  insert into public.nv_financial_document_sequences(owner_user_id, prefix, last_value, updated_at)
  values (v_user, v_prefix, 1, now())
  on conflict (owner_user_id, prefix)
  do update set last_value = public.nv_financial_document_sequences.last_value + 1,
                updated_at = now()
  returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function public.nv_next_financial_document_number(text) from public, anon;
grant execute on function public.nv_next_financial_document_number(text) to authenticated;

-- Índice de apoyo para los registros financieros guardados en app_records.
create index if not exists app_records_financial_lookup_idx
on public.app_records (owner_user_id, store_name, updated_at desc)
where store_name in ('receivablePayments','historicalReceivables','financialDocuments','paymentPlans');

-- Importación idempotente desde la aplicación. Cada deuda conserva su propia operación.
create or replace function public.nv_import_historical_receivable(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
  v_payload jsonb;
begin
  if v_user is null then raise exception 'Sesión no autenticada'; end if;
  if coalesce(trim(p_record->>'clientName'),'') = '' then raise exception 'Cliente obligatorio'; end if;
  if coalesce((p_record->>'total')::numeric,0) <= 0 then raise exception 'Total inválido'; end if;

  v_key := coalesce(nullif(p_record->>'historicalImportKey',''), nullif(p_record->>'id',''));
  if v_key is null then raise exception 'Identificador de importación obligatorio'; end if;

  v_payload := p_record || jsonb_build_object(
    'id', coalesce(p_record->>'id', 'hist_' || v_key),
    'historicalImportKey', v_key,
    'sourceSystem', 'Mi Negocio',
    'origin', 'Importado desde Mi Negocio',
    'historicalActive', true,
    'inventoryImpact', false,
    'stockAlreadyDelivered', true,
    'ownerUserId', v_user::text,
    'importedBy', v_user::text,
    'importedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  insert into public.app_records(store_name, record_id, owner_user_id, visibility, payload)
  values ('historicalReceivables', v_key, v_user, 'private', v_payload)
  on conflict (store_name, record_id, owner_user_id)
  do update set payload = excluded.payload, updated_at = now();

  return v_payload;
end;
$$;

revoke all on function public.nv_import_historical_receivable(jsonb) from public, anon;
grant execute on function public.nv_import_historical_receivable(jsonb) to authenticated;

commit;
