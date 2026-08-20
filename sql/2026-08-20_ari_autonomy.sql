-- ARI Autonomy V1 durable record store.
-- Apply this to the Supabase/Postgres project used by ARI before relying on
-- persistence across Cloud Run instance restarts.

create extension if not exists pgcrypto;

create table if not exists public.ari_autonomy_records (
  id uuid primary key default gen_random_uuid(),
  record_key text not null unique,
  gid text not null,
  kind text not null check (kind in ('settings','goal','task','event','approval','artifact','automation')),
  parent_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ari_autonomy_records_gid_kind_idx
  on public.ari_autonomy_records (gid, kind);

create index if not exists ari_autonomy_records_parent_idx
  on public.ari_autonomy_records (parent_id)
  where parent_id is not null;

create index if not exists ari_autonomy_records_status_idx
  on public.ari_autonomy_records (status)
  where status is not null;

alter table public.ari_autonomy_records enable row level security;

-- ARI accesses this table only with its server-side Supabase secret/service-role
-- credential. Browser roles receive no direct table privileges.
revoke all on table public.ari_autonomy_records from anon, authenticated;
grant all on table public.ari_autonomy_records to service_role;

comment on table public.ari_autonomy_records is
  'Durable goals, tasks, approvals, events and private artifacts for ARI bounded autonomy.';
