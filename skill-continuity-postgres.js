import pg from "pg";
const { Pool } = pg;

export function createPostgresContinuityStore({ connectionString = process.env.SKILL_TAE_DATABASE_URL || "", ssl = process.env.SKILL_TAE_DATABASE_SSL === "true" } = {}) {
  if (!connectionString) return null;
  const pool = new Pool({ connectionString, ssl: ssl ? { rejectUnauthorized: true } : undefined, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  async function write(record) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prior = await client.query(
        "SELECT record FROM tae_skill_continuity WHERE gid=$1 AND session_id=$2 AND idempotency_key=$3 FOR UPDATE",
        [record.gid, record.session_id, record.idempotency_key],
      );
      if (prior.rowCount) {
        const old = prior.rows[0].record;
        if (old.task_id !== record.task_id || old.skill_id !== record.skill_id) throw Object.assign(new Error("Idempotency key already used for a different operation"), { status: 409, code: "IDEMPOTENCY_CONFLICT" });
        await client.query("COMMIT");
        return old;
      }
      await client.query(
        "INSERT INTO tae_skill_continuity (gid, session_id, task_id, idempotency_key, revision, schema_version, record) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [record.gid, record.session_id, record.task_id, record.idempotency_key, record.revision, record.schema_version, JSON.stringify(record)],
      );
      await client.query("COMMIT");
      return record;
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  async function getByIdempotencyKey({ gid, session_id, idempotency_key }) {
    const r = await pool.query("SELECT record FROM tae_skill_continuity WHERE gid=$1 AND session_id=$2 AND idempotency_key=$3", [gid,session_id,idempotency_key]);
    return r.rows[0]?.record || null;
  }
  async function read({ gid, session_id, task_id }) {
    const r = await pool.query("SELECT record FROM tae_skill_continuity WHERE gid=$1 AND session_id=$2 AND task_id=$3 ORDER BY revision DESC LIMIT 1", [gid,session_id,task_id]);
    return r.rows[0]?.record || null;
  }
  async function readSession({ gid, session_id }) {
    const r = await pool.query("SELECT record FROM tae_skill_continuity WHERE gid=$1 AND session_id=$2 ORDER BY created_at ASC, revision ASC", [gid,session_id]);
    return r.rows.map(x=>x.record);
  }
  async function health() { await pool.query("SELECT 1"); return true; }
  return { write, getByIdempotencyKey, read, readSession, health, close: () => pool.end() };
}
