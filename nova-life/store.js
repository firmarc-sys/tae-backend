import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class MemoryStore {
  constructor(seed) {
    this.documents = new Map(Object.entries(seed?.documents || {}));
    this.lineage = [...(seed?.lineage || [])];
    this.chain = Promise.resolve();
  }

  locked(fn) {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async getDocument(id) {
    return clone(this.documents.get(id) || null);
  }

  async putDocument(document) {
    return this.locked(async () => {
      this.documents.set(document.id, clone(document));
      return clone(document);
    });
  }

  async appendLineage(entry) {
    return this.locked(async () => {
      this.lineage.push(clone(entry));
      return clone(entry);
    });
  }

  async listLineage(worldId, limit = 50) {
    return this.lineage
      .filter((entry) => entry.world_id === worldId)
      .slice(-limit)
      .reverse()
      .map(clone);
  }

  async getLineage(id) {
    return clone(this.lineage.find((entry) => entry.id === id) || null);
  }

  snapshot() {
    return {
      documents: Object.fromEntries([...this.documents].map(([key, value]) => [key, clone(value)])),
      lineage: this.lineage.map(clone),
    };
  }
}

class FileStore extends MemoryStore {
  constructor(dir) {
    super();
    this.dir = dir;
    this.file = path.join(dir, 'world.json');
    this.ready = this.load();
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.documents = new Map(Object.entries(parsed.documents || {}));
      this.lineage = parsed.lineage || [];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async persist() {
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(this.snapshot()), 'utf8');
    await fs.rename(temporary, this.file);
  }

  async getDocument(id) {
    await this.ready;
    return super.getDocument(id);
  }

  async putDocument(document) {
    await this.ready;
    const saved = await super.putDocument(document);
    await this.persist();
    return saved;
  }

  async appendLineage(entry) {
    await this.ready;
    const saved = await super.appendLineage(entry);
    await this.persist();
    return saved;
  }

  async listLineage(worldId, limit) {
    await this.ready;
    return super.listLineage(worldId, limit);
  }

  async getLineage(id) {
    await this.ready;
    return super.getLineage(id);
  }
}

class NeonStore {
  constructor(pool) {
    this.pool = pool;
  }

  async getDocument(id) {
    const result = await this.pool.query(
      'select document from public.nova_life_documents where id = $1',
      [id],
    );
    return result.rows[0]?.document || null;
  }

  async putDocument(document) {
    await this.pool.query(
      `insert into public.nova_life_documents
        (id, kind, namespace, revision, contributor_gid, document, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, now())
       on conflict (id) do update set
         kind = excluded.kind,
         revision = excluded.revision,
         contributor_gid = excluded.contributor_gid,
         document = excluded.document,
         updated_at = now()`,
      [
        document.id,
        document.kind,
        document.namespace || 'nova-life',
        Number(document.revision || 1),
        document.contributor_gid || document.gid || null,
        JSON.stringify(document),
      ],
    );
    return document;
  }

  async appendLineage(entry) {
    await this.pool.query(
      `insert into public.nova_life_lineage
        (id, world_id, object_id, parent_id, revision, action, contributor_gid, scope, snapshot)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        entry.id,
        entry.world_id,
        entry.object_id || null,
        entry.parent_id || null,
        Number(entry.revision || 1),
        entry.action,
        entry.contributor_gid,
        entry.scope,
        JSON.stringify(entry.snapshot || {}),
      ],
    );
    return entry;
  }

  async listLineage(worldId, limit = 50) {
    const result = await this.pool.query(
      `select id, world_id, object_id, parent_id, revision, action, contributor_gid, scope, snapshot, created_at
       from public.nova_life_lineage
       where world_id = $1
       order by created_at desc
       limit $2`,
      [worldId, limit],
    );
    return result.rows;
  }

  async getLineage(id) {
    const result = await this.pool.query(
      `select id, world_id, object_id, parent_id, revision, action, contributor_gid, scope, snapshot, created_at
       from public.nova_life_lineage where id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }
}

let neonPool = null;

export function neonPoolFromEnv(env = process.env) {
  const connectionString = env.NEON_DATABASE_URL || env.DATABASE_URL || '';
  if (!connectionString) return null;
  if (!neonPool) {
    neonPool = new Pool({
      connectionString,
      max: Math.max(2, Number(env.NEON_POOL_MAX || 5)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return neonPool;
}

export function createStore({ persistence, dir, pool, seed, env = process.env } = {}) {
  const mode = persistence
    || env.NOVA_LIFE_PERSISTENCE
    || ((pool || env.NEON_DATABASE_URL || env.DATABASE_URL) ? 'neon' : 'file');
  if (mode === 'memory') return new MemoryStore(seed);
  if (mode === 'neon') {
    const resolved = pool || neonPoolFromEnv(env);
    if (!resolved) {
      const error = new Error('Nova Life neon persistence is not configured');
      error.status = 503;
      error.code = 'NEON_NOT_CONFIGURED';
      throw error;
    }
    return new NeonStore(resolved);
  }
  return new FileStore(dir || env.NOVA_LIFE_STATE_DIR || '/tmp/nova-life-state');
}

export { MemoryStore, FileStore, NeonStore };
