-- Jahorin autonomous execution + memory layer.
-- Postgres-compatible for Supabase and Neon. TAE remains persistence authority.

create table if not exists public.autonomy_tasks (
  task_id text primary key default (gen_random_uuid())::text,
  gid text not null references public.gid(gid) on delete cascade,
  session_id text,
  objective_id uuid references public.objectives(objective_id) on delete set null,
  intent text not null,
  mode text not null default 'guided' check (mode in ('guided','manual','scheduled')),
  workflow_id text,
  risk text not null default 'low' check (risk in ('low','moderate','high','critical')),
  status text not null default 'queued' check (status in ('queued','running','approval_required','verifying','verified','failed','cancelled')),
  plan jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (gid,idempotency_key)
);
create index if not exists autonomy_tasks_gid_created_idx on public.autonomy_tasks(gid,created_at desc);
create index if not exists autonomy_tasks_status_idx on public.autonomy_tasks(status,updated_at desc);

create table if not exists public.autonomy_task_events (
  event_id uuid primary key default gen_random_uuid(),
  task_id text not null references public.autonomy_tasks(task_id) on delete cascade,
  gid text not null references public.gid(gid) on delete cascade,
  sequence integer not null,
  event_type text not null,
  agent text,
  phase text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(task_id,sequence)
);
create index if not exists autonomy_task_events_task_idx on public.autonomy_task_events(task_id,sequence);
create index if not exists autonomy_task_events_gid_created_idx on public.autonomy_task_events(gid,created_at desc);

create table if not exists public.memory_items (
  memory_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  kind text not null default 'task_summary',
  scope text not null default 'persistent' check (scope in ('session','project','persistent')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  importance real not null default 0.5 check (importance>=0 and importance<=1),
  status text not null default 'active' check (status in ('active','quarantined','deleted')),
  source_task_id text references public.autonomy_tasks(task_id) on delete set null,
  expires_at timestamptz,
  search_document tsvector generated always as (to_tsvector('simple',coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists memory_items_gid_updated_idx on public.memory_items(gid,updated_at desc);
create index if not exists memory_items_search_idx on public.memory_items using gin(search_document);
create index if not exists memory_items_active_idx on public.memory_items(gid,status,importance desc);

create table if not exists public.autonomy_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  task_id text references public.autonomy_tasks(task_id) on delete set null,
  workflow_id text not null,
  action_kind text not null check (action_kind in ('email','deployment','money','other')),
  action_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','denied','expired','consumed')),
  request_payload jsonb not null default '{}'::jsonb,
  approved_by_gid text,
  approved_at timestamptz,
  consumed_at timestamptz,
  idempotency_key text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(gid,idempotency_key)
);
create index if not exists autonomy_approvals_gid_created_idx on public.autonomy_approvals(gid,created_at desc);
create index if not exists autonomy_approvals_status_idx on public.autonomy_approvals(status,expires_at);

create table if not exists public.automation_invocations (
  invocation_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  task_id text references public.autonomy_tasks(task_id) on delete set null,
  workflow_id text not null,
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued','approval_required','running','verified','verification_failed','failed')),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  policy jsonb not null default '{}'::jsonb,
  thoth_verification jsonb,
  approval_id uuid references public.autonomy_approvals(approval_id) on delete set null,
  error_payload jsonb,
  attempts integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(gid,idempotency_key)
);
create index if not exists automation_invocations_gid_created_idx on public.automation_invocations(gid,created_at desc);
create index if not exists automation_invocations_task_idx on public.automation_invocations(task_id,created_at);

create table if not exists public.thoth_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  task_id text references public.autonomy_tasks(task_id) on delete set null,
  invocation_id uuid references public.automation_invocations(invocation_id) on delete set null,
  workflow_id text not null,
  verdict text not null check (verdict in ('verified','rejected')),
  checks jsonb not null default '[]'::jsonb,
  attestation_hash text not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists thoth_verifications_gid_created_idx on public.thoth_verifications(gid,created_at desc);
create index if not exists thoth_verifications_invocation_idx on public.thoth_verifications(invocation_id);

alter table public.autonomy_tasks enable row level security;
alter table public.autonomy_task_events enable row level security;
alter table public.memory_items enable row level security;
alter table public.autonomy_approvals enable row level security;
alter table public.automation_invocations enable row level security;
alter table public.thoth_verifications enable row level security;

drop policy if exists "autonomy_tasks_self_read" on public.autonomy_tasks;
create policy "autonomy_tasks_self_read" on public.autonomy_tasks
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "autonomy_task_events_self_read" on public.autonomy_task_events;
create policy "autonomy_task_events_self_read" on public.autonomy_task_events
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "memory_items_self_read" on public.memory_items;
create policy "memory_items_self_read" on public.memory_items
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "memory_items_self_quarantine" on public.memory_items;
create policy "memory_items_self_quarantine" on public.memory_items
for update to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())))
with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "autonomy_approvals_self_read" on public.autonomy_approvals;
create policy "autonomy_approvals_self_read" on public.autonomy_approvals
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "automation_invocations_self_read" on public.automation_invocations;
create policy "automation_invocations_self_read" on public.automation_invocations
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

drop policy if exists "thoth_verifications_self_read" on public.thoth_verifications;
create policy "thoth_verifications_self_read" on public.thoth_verifications
for select to authenticated
using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

-- October 2026 Supabase Data API defaults are moving to explicit exposure.
-- Keep anon closed; authenticated receives only the minimum client-readable surface.
revoke all on public.autonomy_tasks, public.autonomy_task_events, public.memory_items,
  public.autonomy_approvals, public.automation_invocations, public.thoth_verifications
from anon, authenticated;

grant select on public.autonomy_tasks, public.autonomy_task_events, public.autonomy_approvals,
  public.automation_invocations, public.thoth_verifications to authenticated;
grant select on public.memory_items to authenticated;
grant update(status) on public.memory_items to authenticated;
