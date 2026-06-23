-- NATURA VIDA V4.8 — Actualización Supabase para buzón, mensajes y usuarios
-- Pegar en Supabase > SQL Editor / Editor SQL > New query / Nueva consulta > Run / Ejecutar.
-- No borra datos existentes.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists document_id text;

create table if not exists public.messages (
  id text primary key,
  type text not null default 'general',
  title text not null default 'Mensaje',
  body text default '',
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text,
  sender_role text,
  recipient_role text default 'Administrador',
  recipient_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'unread' check (status in ('unread','read','archived')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists messages_insert_authenticated on public.messages;
create policy messages_insert_authenticated on public.messages
for insert with check (auth.role() = 'authenticated');

drop policy if exists messages_read_relevant on public.messages;
create policy messages_read_relevant on public.messages
for select using (
  public.is_admin()
  or sender_user_id = auth.uid()
  or recipient_user_id = auth.uid()
  or recipient_role = (
    select role from public.profiles where id = auth.uid() limit 1
  )
);

drop policy if exists messages_update_relevant on public.messages;
create policy messages_update_relevant on public.messages
for update using (
  public.is_admin()
  or sender_user_id = auth.uid()
  or recipient_user_id = auth.uid()
)
with check (
  public.is_admin()
  or sender_user_id = auth.uid()
  or recipient_user_id = auth.uid()
);

create index if not exists idx_messages_created_at on public.messages(created_at desc);
create index if not exists idx_messages_recipient_role on public.messages(recipient_role);
create index if not exists idx_messages_sender_user on public.messages(sender_user_id);
