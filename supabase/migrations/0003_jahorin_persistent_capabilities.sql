-- Additional tenant-scoped persistent capabilities for Jahorin.
-- Apply after 0001_jahorin_runtime.sql and 0002_jahorin_execution_events.sql.
create extension if not exists pgcrypto;

create table if not exists public.jahorin_memories (
  memory_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  memory_key text not null,
  content jsonb not null,
  sensitivity text not null default 'normal' check (sensitivity in ('normal','sensitive')),
  source text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gid, memory_key)
);
create index if not exists jahorin_memories_gid_updated_idx on public.jahorin_memories(gid, updated_at desc);

create table if not exists public.jahorin_tasks (
  task_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open','in_progress','blocked','completed','cancelled')),
  due_at timestamptz,
  scheduled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists jahorin_tasks_gid_status_due_idx on public.jahorin_tasks(gid, status, due_at);
create index if not exists jahorin_tasks_gid_updated_idx on public.jahorin_tasks(gid, updated_at desc);

create table if not exists public.jahorin_audit_events (
  audit_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  request_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null check (outcome in ('allowed','denied','success','failure')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists jahorin_audit_gid_created_idx on public.jahorin_audit_events(gid, created_at desc);

alter table public.jahorin_memories enable row level security;
alter table public.jahorin_tasks enable row level security;
alter table public.jahorin_audit_events enable row level security;

drop policy if exists "jahorin_memories_self" on public.jahorin_memories;
create policy "jahorin_memories_self" on public.jahorin_memories for all to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())))
with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "jahorin_tasks_self" on public.jahorin_tasks;
create policy "jahorin_tasks_self" on public.jahorin_tasks for all to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())))
with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "jahorin_audit_events_self_read" on public.jahorin_audit_events;
create policy "jahorin_audit_events_self_read" on public.jahorin_audit_events for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

grant select, insert, update, delete on public.jahorin_memories, public.jahorin_tasks to authenticated;
grant select on public.jahorin_audit_events to authenticated;
