-- Jahorin durable execution/event spine for TAE.
create extension if not exists pgcrypto;

create table if not exists public.jahorin_executions (
  id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  capability text not null,
  intent text not null,
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  request_id text not null,
  idempotency_key text,
  state text not null default 'accepted' check (state in ('accepted','running','completed','failed','cancel_requested','cancelled')),
  result jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gid, idempotency_key)
);
create index if not exists jahorin_executions_gid_created_idx on public.jahorin_executions(gid, created_at desc);
create index if not exists jahorin_executions_gid_state_idx on public.jahorin_executions(gid, state);

create table if not exists public.jahorin_execution_events (
  event_id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.jahorin_executions(id) on delete cascade,
  gid text not null references public.gid(gid) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists jahorin_execution_events_execution_created_idx on public.jahorin_execution_events(execution_id, created_at asc);
create index if not exists jahorin_execution_events_gid_created_idx on public.jahorin_execution_events(gid, created_at desc);

alter table public.jahorin_executions enable row level security;
alter table public.jahorin_execution_events enable row level security;

drop policy if exists "jahorin_executions_self" on public.jahorin_executions;
create policy "jahorin_executions_self" on public.jahorin_executions
for all to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())))
with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "jahorin_execution_events_self" on public.jahorin_execution_events;
create policy "jahorin_execution_events_self" on public.jahorin_execution_events
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

grant select on public.jahorin_executions, public.jahorin_execution_events to authenticated;
