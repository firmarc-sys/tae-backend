-- Additive Nova Life Live Beta persistence.
-- Apply only to a non-production database. This mission does not migrate production.
-- UAE remains authoritative for GID, sessions, policy, and memory.

create table if not exists public.nova_life_documents (
  id text primary key,
  kind text not null,
  namespace text not null default 'nova-life',
  revision bigint not null default 1,
  contributor_gid text,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nova_life_documents_kind_idx
  on public.nova_life_documents(kind, updated_at desc);

create table if not exists public.nova_life_lineage (
  id text primary key,
  world_id text not null,
  object_id text,
  parent_id text,
  revision bigint not null,
  action text not null,
  contributor_gid text not null,
  scope text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nova_life_lineage_world_created_idx
  on public.nova_life_lineage(world_id, created_at desc);

create index if not exists nova_life_lineage_contributor_idx
  on public.nova_life_lineage(contributor_gid, created_at desc);
