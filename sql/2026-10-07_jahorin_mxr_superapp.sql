-- Jahorin MXR canonical Neon migration.
-- Keeps existing execution records while expanding the truth-state model and
-- adding authoritative Nova Life persistence.

create extension if not exists pgcrypto;

create table if not exists public.jahorin_executions (
  id uuid primary key default gen_random_uuid(),
  gid text not null,
  capability text not null,
  intent text not null,
  payload jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  request_id text not null,
  idempotency_key text,
  state text not null default 'accepted',
  result jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gid, idempotency_key)
);

alter table public.jahorin_executions drop constraint if exists jahorin_executions_state_check;
alter table public.jahorin_executions
  add constraint jahorin_executions_state_check
  check (state in (
    'planned','authorized','queued','accepted','attempted','running','waiting','blocked',
    'completed','verified','failed','cancel_requested','cancelled','rolled_back'
  ));

create index if not exists jahorin_executions_gid_created_idx
  on public.jahorin_executions(gid, created_at desc);
create index if not exists jahorin_executions_gid_state_idx
  on public.jahorin_executions(gid, state);

create table if not exists public.jahorin_execution_events (
  event_id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.jahorin_executions(id) on delete cascade,
  gid text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists jahorin_execution_events_execution_created_idx
  on public.jahorin_execution_events(execution_id, created_at asc);
create index if not exists jahorin_execution_events_gid_created_idx
  on public.jahorin_execution_events(gid, created_at desc);

create table if not exists public.nova_worlds (
  id text primary key,
  tenant_id text not null,
  name text not null,
  revision bigint not null default 1,
  state jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nova_worlds_tenant_updated_idx on public.nova_worlds(tenant_id, updated_at desc);

create table if not exists public.nova_player_state (
  world_id text not null references public.nova_worlds(id) on delete cascade,
  gid text not null,
  revision bigint not null default 1,
  location_id text,
  inventory jsonb not null default '{}'::jsonb,
  quests jsonb not null default '{}'::jsonb,
  relationships jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (world_id, gid)
);
create index if not exists nova_player_state_gid_updated_idx on public.nova_player_state(gid, updated_at desc);

create table if not exists public.jahorin_runtime_checkpoints (
  id uuid primary key default gen_random_uuid(),
  gid text not null,
  execution_id uuid references public.jahorin_executions(id) on delete cascade,
  objective_id text,
  task_id text,
  runtime text not null check (runtime in ('thoth','jahorin','trismegistus','mercury')),
  revision bigint not null default 1,
  checkpoint jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists jahorin_runtime_checkpoints_gid_created_idx
  on public.jahorin_runtime_checkpoints(gid, created_at desc);
create index if not exists jahorin_runtime_checkpoints_execution_idx
  on public.jahorin_runtime_checkpoints(execution_id, created_at desc);
