import crypto from "node:crypto";

export const THOTH_LINEAGE_SCHEMA_VERSION = 1;

export const FOUNDER_AGENTS = Object.freeze(["jahorin", "ta", "thoth", "wepwawet"]);

const STATUS = new Set(["pending", "attempted", "executed", "verified", "rejected", "superseded", "failed", "blocked"]);

function fail(message, status = 400, code = "THOTH_LINEAGE_INVALID") {
  return Object.assign(new Error(message), { status, code });
}

function required(value, label, max = 200) {
  const result = String(value ?? "").trim();
  if (!result || result.length > max) throw fail(`${label} is required`);
  return result;
}

function optional(value, max = 200) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, max) : null;
}

function array(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))] : [];
}

function assertFounder(agent) {
  const normalized = required(agent, "agent", 80).toLowerCase();
  if (!FOUNDER_AGENTS.includes(normalized)) throw fail("Agent is not one of the four Thoth lineage founders", 403, "THOTH_LINEAGE_AGENT_UNAUTHORIZED");
  return normalized;
}

export function createLineageRoot({ tenantId, gid, sessionId, taskId, objectiveId = null, rootAgent = "jahorin", runtimeRevision = "unknown" } = {}) {
  const agent = assertFounder(rootAgent);
  return {
    lineage_id: crypto.randomUUID(),
    root_lineage_id: null,
    parent_lineage_id: null,
    generation: 0,
    root_agent: "jahorin",
    primary_agent: agent,
    task_id: required(taskId, "task_id", 120),
    objective_id: optional(objectiveId, 120),
    session_id: required(sessionId, "session_id", 120),
    tenant_id: required(tenantId, "tenant_id", 160),
    gid: required(gid, "gid", 160),
    runtime_revision: required(runtimeRevision, "runtime_revision", 160),
    schema_version: THOTH_LINEAGE_SCHEMA_VERSION,
    deity_id: null,
    capability_id: null,
    adapter_id: null,
    evidence_ids: [],
    verification_status: "pending",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function deriveLineage(parent, { agent, deityId = null, capabilityId = null, adapterId = null, evidenceIds = [], status = "pending" } = {}) {
  if (!parent?.lineage_id) throw fail("Parent lineage is required");
  if (!STATUS.has(status)) throw fail("Invalid lineage status");
  const primaryAgent = assertFounder(agent);
  const now = new Date().toISOString();
  return {
    ...parent,
    lineage_id: crypto.randomUUID(),
    root_lineage_id: parent.root_lineage_id || parent.lineage_id,
    parent_lineage_id: parent.lineage_id,
    generation: Number(parent.generation || 0) + 1,
    primary_agent: primaryAgent,
    deity_id: optional(deityId, 120),
    capability_id: optional(capabilityId, 160),
    adapter_id: optional(adapterId, 160),
    evidence_ids: array(evidenceIds),
    verification_status: status,
    created_at: now,
    updated_at: now,
  };
}

export async function ensureThothLineageSchema(db) {
  await db().query(`
    create table if not exists public.thoth_lineage_events (
      lineage_id uuid primary key,
      root_lineage_id uuid,
      parent_lineage_id uuid,
      generation integer not null default 0,
      root_agent text not null default 'jahorin',
      primary_agent text not null,
      tenant_id text not null,
      gid text not null,
      session_id text not null,
      task_id text not null,
      objective_id text,
      deity_id text,
      capability_id text,
      adapter_id text,
      runtime_revision text not null,
      schema_version integer not null,
      evidence_ids jsonb not null default '[]'::jsonb,
      verification_status text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists thoth_lineage_root_idx on public.thoth_lineage_events(root_lineage_id, created_at);
    create index if not exists thoth_lineage_parent_idx on public.thoth_lineage_events(parent_lineage_id);
    create index if not exists thoth_lineage_tenant_idx on public.thoth_lineage_events(tenant_id, gid, created_at);
  `);
}

export async function persistLineage(db, lineage) {
  if (!lineage?.lineage_id) throw fail("lineage_id is required");
  await ensureThothLineageSchema(db);
  await db().query(
    `insert into public.thoth_lineage_events
      (lineage_id,root_lineage_id,parent_lineage_id,generation,root_agent,primary_agent,tenant_id,gid,session_id,task_id,objective_id,deity_id,capability_id,adapter_id,runtime_revision,schema_version,evidence_ids,verification_status,created_at,updated_at)
     values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19::timestamptz,$20::timestamptz)
     on conflict (lineage_id) do update set
       evidence_ids=excluded.evidence_ids,
       verification_status=excluded.verification_status,
       updated_at=excluded.updated_at`,
    [
      lineage.lineage_id,
      lineage.root_lineage_id,
      lineage.parent_lineage_id,
      lineage.generation,
      lineage.root_agent,
      lineage.primary_agent,
      lineage.tenant_id,
      lineage.gid,
      lineage.session_id,
      lineage.task_id,
      lineage.objective_id,
      lineage.deity_id,
      lineage.capability_id,
      lineage.adapter_id,
      lineage.runtime_revision,
      lineage.schema_version,
      JSON.stringify(lineage.evidence_ids || []),
      lineage.verification_status,
      lineage.created_at,
      lineage.updated_at,
    ],
  );
  return lineage;
}

export async function getLineage(db, { tenantId, gid, lineageId }) {
  await ensureThothLineageSchema(db);
  const result = await db().query(
    `select lineage_id::text,root_lineage_id::text,parent_lineage_id::text,generation,root_agent,primary_agent,tenant_id,gid,session_id,task_id,objective_id,deity_id,capability_id,adapter_id,runtime_revision,schema_version,evidence_ids,verification_status,created_at,updated_at
     from public.thoth_lineage_events
     where lineage_id=$1::uuid and tenant_id=$2 and gid=$3
     limit 1`,
    [required(lineageId, "lineage_id", 80), required(tenantId, "tenant_id", 160), required(gid, "gid", 160)],
  );
  return result.rows[0] || null;
}

export function verifyLineageStructure(lineage) {
  const failures = [];
  if (!lineage?.lineage_id) failures.push("missing_lineage_id");
  if (lineage?.root_agent !== "jahorin") failures.push("invalid_root_agent");
  if (!FOUNDER_AGENTS.includes(String(lineage?.primary_agent || "").toLowerCase())) failures.push("invalid_primary_agent");
  if (!lineage?.task_id) failures.push("missing_task_id");
  if (!lineage?.session_id) failures.push("missing_session_id");
  if (!lineage?.tenant_id || !lineage?.gid) failures.push("missing_tenant_scope");
  if (!lineage?.runtime_revision) failures.push("missing_runtime_revision");
  if (!Number.isInteger(Number(lineage?.schema_version))) failures.push("missing_schema_version");
  return { verified: failures.length === 0, failures };
}
