-- Apply only to an isolated non-production database first.
CREATE TABLE IF NOT EXISTS public.tae_skill_continuity (
  gid text NOT NULL,
  session_id text NOT NULL,
  task_id text NOT NULL,
  idempotency_key text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gid, session_id, idempotency_key),
  UNIQUE (gid, session_id, task_id, revision)
);
CREATE INDEX IF NOT EXISTS tae_skill_continuity_session_idx
  ON public.tae_skill_continuity (gid, session_id, created_at);
-- Server-side service role only. Never expose this table through a browser client.
ALTER TABLE public.tae_skill_continuity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tae_skill_continuity FROM anon, authenticated;
GRANT SELECT, INSERT ON public.tae_skill_continuity TO service_role;
