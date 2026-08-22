import { Pool } from "pg";

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString
  ? new Pool({
      connectionString,
      max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    })
  : null;

export const neonConfigured = Boolean(pool);

function requirePool() {
  if (!pool) {
    const error = new Error("Neon is not configured on ARI");
    error.status = 503;
    throw error;
  }
  return pool;
}

export async function neonHealth() {
  if (!pool) return false;
  try {
    const result = await pool.query("select 1 as ok");
    return result.rows?.[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function ensureNeonIdentity({ gid, authUserId = null, identityScope = "consumer", displayName = null }) {
  if (!gid) throw Object.assign(new Error("gid is required"), { status: 400 });
  const db = requirePool();
  await db.query(
    `insert into public.jahorin_identities (gid, auth_user_id, identity_scope, display_name)
     values ($1, $2, $3, $4)
     on conflict (gid) do update set
       auth_user_id = coalesce(excluded.auth_user_id, public.jahorin_identities.auth_user_id),
       identity_scope = excluded.identity_scope,
       display_name = coalesce(excluded.display_name, public.jahorin_identities.display_name),
       updated_at = now()`,
    [gid, authUserId, identityScope, displayName],
  );
  await db.query(
    `insert into public.jahorin_twin_state (gid)
     values ($1)
     on conflict (gid) do nothing`,
    [gid],
  );
  await db.query(
    `insert into public.jahorin_context_permissions (gid)
     values ($1)
     on conflict (gid) do nothing`,
    [gid],
  );
  await db.query(
    `insert into public.jahorin_preferences (gid)
     values ($1)
     on conflict (gid) do nothing`,
    [gid],
  );
  return getNeonIdentity(gid);
}

export async function getNeonIdentity(gid) {
  const db = requirePool();
  const result = await db.query(
    `select gid, auth_user_id, identity_scope, display_name, created_at, updated_at
     from public.jahorin_identities where gid=$1 limit 1`,
    [gid],
  );
  return result.rows[0] || null;
}

export async function getTwinState(gid) {
  const db = requirePool();
  const [twin, permissions, preferences, usage, projects, recent] = await Promise.all([
    db.query(`select schema_version, mode, learning_enabled, confidence, state, updated_at from public.jahorin_twin_state where gid=$1`, [gid]),
    db.query(`select permissions, updated_at from public.jahorin_context_permissions where gid=$1`, [gid]),
    db.query(`select preferences, updated_at from public.jahorin_preferences where gid=$1`, [gid]),
    db.query(`select capability, use_count, updated_at from public.jahorin_capability_usage where gid=$1 order by capability`, [gid]),
    db.query(`select id, name, status, capability, page, next_action, weight, metadata, created_at, updated_at from public.jahorin_projects where gid=$1 order by updated_at desc limit 25`, [gid]),
    db.query(`select id, event_type, payload, created_at from public.jahorin_twin_events where gid=$1 order by created_at desc limit 40`, [gid]),
  ]);
  const row = twin.rows[0] || null;
  if (!row) return null;
  return {
    schema: row.schema_version,
    mode: row.mode,
    learningEnabled: row.learning_enabled,
    confidence: Number(row.confidence),
    state: row.state || {},
    sources: permissions.rows[0]?.permissions || {},
    preferences: preferences.rows[0]?.preferences || {},
    capabilityUsage: Object.fromEntries(usage.rows.map((r) => [r.capability, Number(r.use_count)])),
    projects: projects.rows,
    recentEvents: recent.rows,
    updatedAt: row.updated_at,
  };
}

export async function mergeTwinState(gid, patch = {}) {
  const db = requirePool();
  const learningEnabled = patch.learningEnabled;
  const confidence = Number.isFinite(Number(patch.confidence)) ? Math.max(0, Math.min(1, Number(patch.confidence))) : null;
  const statePatch = patch.state && typeof patch.state === "object" ? patch.state : {};
  const result = await db.query(
    `update public.jahorin_twin_state
     set learning_enabled = coalesce($2, learning_enabled),
         confidence = coalesce($3, confidence),
         state = state || $4::jsonb,
         updated_at = now()
     where gid=$1
     returning schema_version, mode, learning_enabled, confidence, state, updated_at`,
    [gid, learningEnabled ?? null, confidence, JSON.stringify(statePatch)],
  );
  return result.rows[0] || null;
}

export async function setTwinPermissions(gid, permissions = {}) {
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_context_permissions (gid, permissions)
     values ($1, $2::jsonb)
     on conflict (gid) do update set permissions = public.jahorin_context_permissions.permissions || excluded.permissions, updated_at=now()
     returning permissions, updated_at`,
    [gid, JSON.stringify(permissions)],
  );
  return result.rows[0];
}

export async function setTwinPreferences(gid, preferences = {}) {
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_preferences (gid, preferences)
     values ($1, $2::jsonb)
     on conflict (gid) do update set preferences = public.jahorin_preferences.preferences || excluded.preferences, updated_at=now()
     returning preferences, updated_at`,
    [gid, JSON.stringify(preferences)],
  );
  return result.rows[0];
}

export async function recordTwinEvent(gid, eventType, payload = {}) {
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_twin_events (gid, event_type, payload)
     values ($1, $2, $3::jsonb)
     returning id, event_type, payload, created_at`,
    [gid, eventType, JSON.stringify(payload)],
  );
  return result.rows[0];
}

export async function incrementCapabilityUsage(gid, capability) {
  if (!capability) return null;
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_capability_usage (gid, capability, use_count)
     values ($1, $2, 1)
     on conflict (gid, capability) do update set use_count=public.jahorin_capability_usage.use_count+1, updated_at=now()
     returning capability, use_count, updated_at`,
    [gid, String(capability).toLowerCase()],
  );
  return result.rows[0];
}

export async function recordPrediction(gid, prediction = {}, context = {}) {
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_twin_predictions (gid, intent, capability, page, confidence, reason, status, context)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     returning id, intent, capability, page, confidence, reason, status, context, created_at`,
    [
      gid,
      prediction.intent || null,
      prediction.capability || null,
      prediction.page || null,
      Number.isFinite(Number(prediction.confidence)) ? Number(prediction.confidence) : null,
      prediction.reason || null,
      prediction.status || "proposed",
      JSON.stringify(context || {}),
    ],
  );
  return result.rows[0];
}

export async function listPredictions(gid, limit = 12) {
  const db = requirePool();
  const result = await db.query(
    `select id, intent, capability, page, confidence, reason, status, context, created_at, resolved_at
     from public.jahorin_twin_predictions where gid=$1 order by created_at desc limit $2`,
    [gid, Math.max(1, Math.min(50, Number(limit) || 12))],
  );
  return result.rows;
}

export async function resolveLatestPrediction(gid, status) {
  const db = requirePool();
  const result = await db.query(
    `update public.jahorin_twin_predictions
     set status=$2, resolved_at=now()
     where id=(select id from public.jahorin_twin_predictions where gid=$1 and status='proposed' order by created_at desc limit 1)
     returning id, intent, capability, page, confidence, reason, status, resolved_at`,
    [gid, status],
  );
  return result.rows[0] || null;
}

export async function adjustTwinConfidence(gid, delta) {
  const db = requirePool();
  const result = await db.query(
    `update public.jahorin_twin_state
     set confidence=greatest(0.05,least(0.99,confidence+$2)), updated_at=now()
     where gid=$1 returning confidence, updated_at`,
    [gid, Number(delta) || 0],
  );
  return result.rows[0] || null;
}

export async function recordTimeline(gid, turn = {}) {
  const db = requirePool();
  const result = await db.query(
    `insert into public.jahorin_timeline (gid, intent, capability, page, request_id, state)
     values ($1,$2,$3,$4,$5,$6::jsonb)
     returning id, intent, capability, page, request_id, state, created_at`,
    [gid, turn.intent || null, turn.capability || null, turn.page || null, turn.request_id || null, JSON.stringify(turn.state || turn)],
  );
  return result.rows[0];
}

export async function getTimeline(gid, limit = 40) {
  const db = requirePool();
  const result = await db.query(
    `select id, intent, capability, page, request_id, state, created_at
     from public.jahorin_timeline where gid=$1 order by created_at desc limit $2`,
    [gid, Math.max(1, Math.min(100, Number(limit) || 40))],
  );
  return result.rows;
}

export async function clearTwin(gid) {
  const db = requirePool();
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query(`delete from public.jahorin_twin_events where gid=$1`, [gid]);
    await client.query(`delete from public.jahorin_twin_predictions where gid=$1`, [gid]);
    await client.query(`delete from public.jahorin_projects where gid=$1`, [gid]);
    await client.query(`delete from public.jahorin_timeline where gid=$1`, [gid]);
    await client.query(`delete from public.jahorin_capability_usage where gid=$1`, [gid]);
    await client.query(`update public.jahorin_twin_state set learning_enabled=true, confidence=0.5, state='{}'::jsonb, updated_at=now() where gid=$1`, [gid]);
    await client.query(`update public.jahorin_preferences set preferences='{}'::jsonb, updated_at=now() where gid=$1`, [gid]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeNeon() {
  if (pool) await pool.end();
}
