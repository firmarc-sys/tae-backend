import { Pool } from 'pg';
import { getNovaLife } from './nova-life/index.js';

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const pool = connectionString ? new Pool({
  connectionString,
  max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
}) : null;

export async function executeNovaCapability({ capability, gid, payload = {}, context = {} }) {
  const operation = capability === 'nova-life' ? 'world.enter' : capability.replace(/^nova\./, '');
  const engine = getNovaLife();
  const principal = {
    authenticated: Boolean(gid),
    gid: gid || null,
    kind: 'session',
    tier: null,
    experienceAccess: [],
  };
  if (operation === 'world.enter' || operation === 'enter') return engine.enter(principal, payload);
  if (operation === 'world.observe' || operation === 'observe') return engine.observe(principal, payload);
  if (operation === 'character.interact' || operation === 'interact' || operation === 'world.intent') {
    const utterance = payload?.utterance || payload?.intent || context?.intent || '';
    return engine.intent(principal, utterance, payload);
  }
  const error = new Error(`Nova capability '${capability}' is not registered`);
  error.status = 404;
  error.code = 'CAPABILITY_UNAVAILABLE';
  throw error;
}

export async function novaLifeHealth() {
  if (!pool) return false;
  try { await pool.query('select 1'); return true; } catch { return false; }
}
