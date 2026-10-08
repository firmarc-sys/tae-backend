import { Pool } from 'pg';

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const pool = connectionString
  ? new Pool({
      connectionString,
      max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    })
  : null;

function db() {
  if (!pool) {
    const error = new Error('Neon execution persistence is not configured');
    error.status = 503;
    error.code = 'NEON_NOT_CONFIGURED';
    throw error;
  }
  return pool;
}

export async function executionStoreHealth() {
  if (!pool) return false;
  try {
    const result = await pool.query('select 1 as ok');
    return result.rows?.[0]?.ok === 1;
  } catch {
    return false;
  }
}

export async function findIdempotentExecution(gid, key) {
  if (!key) return null;
  const result = await db().query(
    `select * from public.jahorin_executions
     where gid=$1 and idempotency_key=$2
     limit 1`,
    [gid, key],
  );
  return result.rows[0] || null;
}

export async function createExecution({ id, gid, capability, intent, payload = {}, context = {}, requestId, idempotencyKey = null }) {
  const result = await db().query(
    `insert into public.jahorin_executions
      (id,gid,capability,intent,payload,context,request_id,idempotency_key,state,created_at,updated_at)
     values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,'accepted',now(),now())
     returning *`,
    [id, gid, capability, intent, JSON.stringify(payload), JSON.stringify(context), requestId, idempotencyKey],
  );
  return result.rows[0];
}

export async function getExecution(gid, executionId) {
  const result = await db().query(
    `select * from public.jahorin_executions where gid=$1 and id=$2 limit 1`,
    [gid, executionId],
  );
  return result.rows[0] || null;
}

export async function updateExecution(gid, executionId, patch = {}) {
  const allowed = new Map([
    ['state', 'state'],
    ['result', 'result'],
    ['error', 'error'],
    ['started_at', 'started_at'],
    ['completed_at', 'completed_at'],
  ]);
  const values = [];
  const sets = [];
  for (const [key, column] of allowed) {
    if (!(key in patch)) continue;
    values.push(['result', 'error'].includes(key) ? JSON.stringify(patch[key]) : patch[key]);
    const cast = ['result', 'error'].includes(key) ? '::jsonb' : '';
    sets.push(`${column}=$${values.length}${cast}`);
  }
  if (!sets.length) return getExecution(gid, executionId);
  values.push(gid, executionId);
  const result = await db().query(
    `update public.jahorin_executions
     set ${sets.join(', ')}, updated_at=now()
     where gid=$${values.length - 1} and id=$${values.length}
     returning *`,
    values,
  );
  return result.rows[0] || null;
}

export async function appendExecutionEvent({ gid, executionId, type, payload = {}, requestId = null }) {
  const result = await db().query(
    `insert into public.jahorin_execution_events
      (execution_id,gid,event_type,payload,request_id,created_at)
     values ($1,$2,$3,$4::jsonb,$5,now())
     returning *`,
    [executionId, gid, type, JSON.stringify(payload), requestId],
  );
  return result.rows[0];
}

export async function listExecutionEvents({ gid, executionId, after = new Date(0).toISOString(), limit = 100 }) {
  const result = await db().query(
    `select * from public.jahorin_execution_events
     where gid=$1 and execution_id=$2 and created_at>$3
     order by created_at asc
     limit $4`,
    [gid, executionId, after, Math.max(1, Math.min(500, Number(limit) || 100))],
  );
  return result.rows;
}
