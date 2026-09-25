-- Jahorin runtime persistence on Supabase/Postgres.
-- GID is the authoritative application identity spine.
create extension if not exists pgcrypto;

create table if not exists public.gid (
  gid text primary key,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.jahorin_accounts (
  account_id uuid primary key default gen_random_uuid(),
  gid text not null unique references public.gid(gid) on delete cascade,
  display_name text,
  status text not null default 'active' check (status in ('active','disabled','deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  subscription_id uuid primary key default gen_random_uuid(),
  gid text not null unique references public.gid(gid) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  usage_limit bigint not null default 5000,
  usage_used bigint not null default 0,
  rc_balance numeric(20,6) not null default 0,
  provider_customer_id text,
  provider_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.objectives (
  objective_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active',
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists objectives_gid_updated_idx on public.objectives(gid, updated_at desc);

create table if not exists public.continuity_events (
  event_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  objective_id uuid references public.objectives(objective_id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists continuity_events_gid_created_idx on public.continuity_events(gid, created_at desc);

create table if not exists public.artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  objective_id uuid references public.objectives(objective_id) on delete set null,
  kind text not null,
  title text,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists artifacts_gid_updated_idx on public.artifacts(gid, updated_at desc);

create table if not exists public.retrograde_ledger (
  ledger_id uuid primary key default gen_random_uuid(),
  gid text not null references public.gid(gid) on delete cascade,
  transaction_type text not null,
  amount numeric(20,6) not null,
  balance_after numeric(20,6) not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists retrograde_ledger_gid_created_idx on public.retrograde_ledger(gid, created_at desc);

-- Immutable ledger: no UPDATE/DELETE through normal application roles.
create or replace function public.prevent_retrograde_mutation()
returns trigger language plpgsql security invoker as $$
begin
  raise exception 'retrograde_ledger is immutable';
end;
$$;
drop trigger if exists retrograde_ledger_immutable on public.retrograde_ledger;
create trigger retrograde_ledger_immutable
before update or delete on public.retrograde_ledger
for each row execute function public.prevent_retrograde_mutation();

-- Server-side state reconstruction helper.
create or replace view public.jahorin_runtime_state
with (security_invoker = true) as
select
  g.gid,
  a.account_id,
  a.display_name,
  a.status as account_status,
  s.plan,
  s.status as subscription_status,
  s.usage_limit,
  s.usage_used,
  s.rc_balance,
  coalesce(o.objectives, '[]'::jsonb) as objectives,
  coalesce(e.events, '[]'::jsonb) as continuity_events
from public.gid g
join public.jahorin_accounts a on a.gid = g.gid
left join public.subscriptions s on s.gid = g.gid
left join lateral (
  select jsonb_agg(to_jsonb(x) order by x.updated_at desc) objectives
  from (
    select objective_id,title,description,status,state,created_at,updated_at
    from public.objectives where gid=g.gid order by updated_at desc limit 50
  ) x
) o on true
left join lateral (
  select jsonb_agg(to_jsonb(x) order by x.created_at desc) events
  from (
    select event_id,objective_id,event_type,payload,request_id,created_at
    from public.continuity_events where gid=g.gid order by created_at desc limit 100
  ) x
) e on true;

alter table public.gid enable row level security;
alter table public.jahorin_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.objectives enable row level security;
alter table public.continuity_events enable row level security;
alter table public.artifacts enable row level security;
alter table public.retrograde_ledger enable row level security;

create policy "gid_self" on public.gid for select to authenticated using ((select auth.uid()) = auth_user_id);
create policy "account_self" on public.jahorin_accounts for select to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));
create policy "subscription_self" on public.subscriptions for select to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));
create policy "objectives_self" on public.objectives for all to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid()))) with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));
create policy "continuity_self" on public.continuity_events for select to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));
create policy "artifacts_self" on public.artifacts for all to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid()))) with check (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));
create policy "ledger_self" on public.retrograde_ledger for select to authenticated using (gid in (select gid from public.gid where auth_user_id=(select auth.uid())));

grant select on public.gid, public.jahorin_accounts, public.subscriptions, public.objectives, public.continuity_events, public.artifacts, public.retrograde_ledger to authenticated;
