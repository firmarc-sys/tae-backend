import crypto from 'node:crypto';
import { Pool } from 'pg';

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
const pool = connectionString ? new Pool({
  connectionString,
  max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
}) : null;

function db() {
  if (!pool) {
    const error = new Error('Nova Life requires Neon persistence');
    error.status = 503;
    error.code = 'NEON_NOT_CONFIGURED';
    throw error;
  }
  return pool;
}

async function ensureWorld({ worldId = 'nova-primary', tenantId = 'default' }) {
  const result = await db().query(
    `insert into public.nova_worlds (id, tenant_id, name, revision, state)
     values ($1,$2,$3,1,$4::jsonb)
     on conflict (id) do update set updated_at=now()
     returning *`,
    [worldId, tenantId, 'Nova Life', JSON.stringify({ clock: { tick: 0 }, status: 'living' })],
  );
  return result.rows[0];
}

async function ensurePlayer({ worldId, gid }) {
  const result = await db().query(
    `insert into public.nova_player_state
      (world_id,gid,revision,location_id,inventory,quests,relationships,state)
     values ($1,$2,1,'origin','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,$3::jsonb)
     on conflict (world_id,gid) do update set updated_at=now()
     returning *`,
    [worldId, gid, JSON.stringify({ presence: 'active' })],
  );
  return result.rows[0];
}

async function enter({ gid, payload, context }) {
  const worldId = String(payload?.worldId || payload?.world_id || 'nova-primary');
  const tenantId = String(context?.tenant_id || context?.tenantId || 'default');
  const world = await ensureWorld({ worldId, tenantId });
  const player = await ensurePlayer({ worldId, gid });
  return {
    kind: 'nova.session',
    session_id: crypto.randomUUID(),
    world_id: world.id,
    world_revision: Number(world.revision),
    player_id: gid,
    player_revision: Number(player.revision),
    location_id: player.location_id,
    connected_at: new Date().toISOString(),
  };
}

async function observe({ gid, payload }) {
  const worldId = String(payload?.worldId || payload?.world_id || 'nova-primary');
  const world = await db().query(`select * from public.nova_worlds where id=$1 limit 1`, [worldId]);
  if (!world.rows[0]) {
    const error = new Error('Nova world not found');
    error.status = 404;
    error.code = 'NOVA_WORLD_NOT_FOUND';
    throw error;
  }
  const player = await ensurePlayer({ worldId, gid });
  return {
    kind: 'nova.snapshot',
    world: world.rows[0],
    player,
    observed_at: new Date().toISOString(),
  };
}

async function interact({ gid, payload }) {
  const worldId = String(payload?.worldId || payload?.world_id || 'nova-primary');
  const characterId = String(payload?.characterId || payload?.character_id || 'world');
  const utterance = String(payload?.utterance || payload?.intent || '').trim();
  if (!utterance) {
    const error = new Error('Nova interaction utterance is required');
    error.status = 422;
    error.code = 'NOVA_INTENT_REQUIRED';
    throw error;
  }
  await ensureWorld({ worldId, tenantId: String(payload?.tenantId || 'default') });
  await ensurePlayer({ worldId, gid });
  const eventId = crypto.randomUUID();
  const update = await db().query(
    `update public.nova_worlds
     set revision=revision+1,
         state=jsonb_set(state, '{last_event}', $2::jsonb, true),
         updated_at=now()
     where id=$1
     returning revision, updated_at`,
    [worldId, JSON.stringify({ event_id: eventId, actor: gid, character_id: characterId, utterance, at: new Date().toISOString() })],
  );
  return {
    kind: 'nova.world_event',
    event_id: eventId,
    world_id: worldId,
    world_revision: Number(update.rows[0]?.revision || 0),
    character_id: characterId,
    accepted: true,
    persisted: true,
  };
}

export async function executeNovaCapability({ capability, gid, payload = {}, context = {} }) {
  const operation = capability === 'nova-life' ? 'world.enter' : capability.replace(/^nova\./, '');
  if (operation === 'world.enter' || operation === 'enter') return enter({ gid, payload, context });
  if (operation === 'world.observe' || operation === 'observe') return observe({ gid, payload, context });
  if (operation === 'character.interact' || operation === 'interact') return interact({ gid, payload, context });
  const error = new Error(`Nova capability '${capability}' is not registered`);
  error.status = 404;
  error.code = 'CAPABILITY_UNAVAILABLE';
  throw error;
}

export async function novaLifeHealth() {
  if (!pool) return false;
  try { await pool.query('select 1'); return true; } catch { return false; }
}
