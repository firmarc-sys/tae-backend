import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createNovaLife } from '../nova-life/engine.js';
import { GoogleVertexProvider } from '../nova-life/provider.js';
import { installNovaLifeRoutes } from '../nova-life/routes.js';
import { FileStore, NeonStore, createStore } from '../nova-life/store.js';

const ENV = {
  NOVA_LIFE_BETA_GIDS: 'beta-gid-001,beta-gid-002',
  SIOS_OWNER_GID: '399152573423',
  NOVA_LIFE_WORLD_ID: 'pangea-valley',
  NOVA_LIFE_PERSISTENCE: 'memory',
};

const beta = { kind: 'guest', gid: 'beta-gid-001', tier: 'free' };
const stranger = { kind: 'guest', gid: 'stranger-gid', tier: 'free' };
const owner = { kind: 'owner', gid: '399152573423', tier: 'owner' };

function engine(extra = {}) {
  return createNovaLife({
    store: createStore({ persistence: 'memory' }),
    env: { ...ENV, ...extra.env },
    provider: extra.provider,
    executeN8n: extra.executeN8n,
  });
}

async function listen(nova, authorize) {
  const app = express();
  app.use(express.json());
  installNovaLifeRoutes(app, {
    authorize,
    responseBase: (extra) => ({ ok: true, ...extra }),
    engine: nova,
  });
  app.use((error, _req, res, _next) => {
    res.status(Number(error.status) || 500).json({
      ok: false,
      error: error.message,
      code: error.code || 'ARI_ERROR',
      verification: error.verification || null,
      governance: error.governance || null,
    });
  });
  const server = await new Promise((resolve) => {
    const started = app.listen(0, '127.0.0.1', () => resolve(started));
  });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('signed-out orbit does not grant ground access', async () => {
  const nova = engine();
  const orbit = nova.orbit();
  assert.equal(orbit.experience, 'orbit');
  assert.equal(orbit.planet.entry_object, true);
  assert.equal(orbit.login_created, false);
  assert.equal(nova.identityContract(null).experience, 'orbit');
  assert.equal(nova.identityContract({ kind: 'public' }).authorized, false);
});

test('unauthorized GID stays in Jahorin and cannot mutate the world', async () => {
  const nova = engine();
  const contract = nova.identityContract(stranger);
  assert.equal(contract.experience, 'jahorin');
  assert.equal(contract.authorized, false);
  await assert.rejects(() => nova.enter(stranger, { experienceAccess: ['nova-life'], beta: true }), { code: 'NOVA_LIFE_ACCESS_DENIED' });
});

test('authorized beta GID and owner enter; first entry then return', async () => {
  const nova = engine();
  const first = await nova.enter(beta, { beta: '1' });
  assert.equal(first.experience, 'nova-life-live-beta');
  assert.equal(first.first_entry, true);
  assert.equal(first.sequence[0], 'orbit');
  assert.equal(first.sequence.at(-1), 'living-world');
  assert.equal(first.voice_dock.modules.includes('forge'), true);
  assert.equal(first.voice_dock.augment, false);
  assert.equal(first.client_claims.ignored, true);
  assert.equal(first.login_created, false);
  const again = await nova.enter(beta);
  assert.equal(again.first_entry, false);
  assert.equal(again.phase, 'return');
  assert.equal(again.sequence.includes('atmospheric-descent'), false);
  const ownerEntry = await nova.enter(owner);
  assert.equal(ownerEntry.authorized, true);
});

test('Jahorin builds stay personal and Nova Life builds keep contributor GID', async () => {
  const nova = engine();
  const personal = await nova.intent(beta, 'Build a survival game here.', { scope: 'jahorin' });
  assert.equal(personal.build.scope, 'personal');
  assert.equal(personal.build.owner, 'beta-gid-001');
  assert.equal(personal.world_mutated, false);
  const acceptedPersonal = await nova.accept(beta, personal.build.id);
  assert.equal(acceptedPersonal.world_mutated, false);
  const shared = await nova.intent(beta, 'Build a bridge here.');
  assert.equal(shared.build.scope, 'nova-life-world');
  assert.equal(shared.build.owner, 'nova-life');
  assert.equal(shared.build.contributor_gid, 'beta-gid-001');
  const accepted = await nova.accept(beta, shared.build.id);
  assert.equal(accepted.world_mutated, true);
  assert.equal(accepted.object.origin_contributor_gid, 'beta-gid-001');
  assert.equal(accepted.object.owner, 'nova-life');
  const seen = await nova.observe(beta);
  assert.equal(Boolean(seen.world.objects[shared.build.preview.id]), true);
  assert.equal(seen.world.objects[personal.build.preview.id], undefined);
  const who = await nova.intent(beta, 'Who built this?', { object_id: accepted.object.id });
  assert.equal(who.contributor_gid, 'beta-gid-001');
  assert.equal(who.origin_contributor_gid, 'beta-gid-001');
});

test('forge create, modify, build mode, play mode, lineage, and rollback', async () => {
  const nova = engine();
  const temple = await nova.intent(beta, 'Put a temple on that mountain.');
  assert.equal(temple.mode, 'build');
  assert.equal(temple.build.preview.structure || temple.build.preview.name, 'temple');
  const modified = await nova.modify(beta, temple.build.id, { name: 'Solar Temple' });
  assert.equal(modified.build.preview.name, 'Solar Temple');
  assert.equal(modified.world_mutated, false);
  const played = await nova.test(beta, temple.build.id);
  assert.equal(played.mode, 'play');
  assert.equal(played.play_contract.world_mutated, false);
  const before = await nova.observe(beta);
  const revisionBefore = before.world.revision;
  const accepted = await nova.accept(beta, temple.build.id);
  assert.equal(accepted.object.name, 'Solar Temple');
  assert.ok(accepted.world_revision > revisionBefore);
  const changed = await nova.intent(beta, 'What changed here?');
  assert.equal(changed.lineage[0].contributor_gid, 'beta-gid-001');
  const rolled = await nova.intent(beta, 'Undo my last change.');
  assert.equal(rolled.lineage.action, 'rollback');
  const after = await nova.observe(beta);
  assert.equal(after.world.objects[accepted.object.id], undefined);
  const history = await nova.store.listLineage('pangea-valley', 10);
  assert.equal(history.some((entry) => entry.action === 'accept' && entry.contributor_gid === 'beta-gid-001'), true);
});

test('spatial commands, navigation, and continue', async () => {
  const nova = engine();
  for (const utterance of [
    'Turn this valley into a racing course.',
    'Make this cave playable.',
    'Create creatures for this forest.',
    'Make this island multiplayer.',
  ]) {
    const built = await nova.intent(beta, utterance);
    assert.equal(built.kind, 'nova.forge.preview');
    assert.equal(built.build.contributor_gid, 'beta-gid-001');
  }
  const continued = await nova.intent(beta, 'Continue what I was building.');
  assert.equal(continued.mode, 'build');
  const forge = await nova.intent(beta, 'Take me to Forge.');
  assert.equal(forge.destination.module, 'forge');
  assert.equal(forge.destination.region, 'the-forge');
});

test('file persistence survives a new store instance', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-life-'));
  const first = createNovaLife({
    store: new FileStore(dir),
    env: ENV,
  });
  const built = await first.intent(beta, 'Build a bridge here.');
  await first.accept(beta, built.build.id);
  const second = createNovaLife({ store: new FileStore(dir), env: ENV });
  const seen = await second.observe(beta);
  const bridge = Object.values(seen.world.objects).find((object) => object.name === 'bridge');
  assert.ok(bridge);
  assert.equal(bridge.contributor_gid, 'beta-gid-001');
  assert.equal((await second.store.listLineage('pangea-valley', 5)).length > 0, true);
});

test('neon store round-trips documents without exposing credentials', async () => {
  const documents = new Map();
  const lineage = [];
  const pool = {
    async query(sql, params) {
      if (sql.includes('from public.nova_life_documents')) {
        const document = documents.get(params[0]);
        return { rows: document ? [{ document }] : [] };
      }
      if (sql.includes('insert into public.nova_life_documents')) {
        documents.set(params[0], JSON.parse(params[5]));
        return { rows: [] };
      }
      if (sql.includes('insert into public.nova_life_lineage')) {
        lineage.unshift({
          id: params[0],
          world_id: params[1],
          object_id: params[2],
          parent_id: params[3],
          revision: params[4],
          action: params[5],
          contributor_gid: params[6],
          scope: params[7],
          snapshot: JSON.parse(params[8]),
        });
        return { rows: [] };
      }
      if (sql.includes('where world_id')) return { rows: lineage.filter((entry) => entry.world_id === params[0]).slice(0, params[1]) };
      if (sql.includes('where id')) return { rows: lineage.filter((entry) => entry.id === params[0]) };
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
  const nova = createNovaLife({ store: new NeonStore(pool), env: ENV });
  const built = await nova.intent(beta, 'Build a bridge here.');
  await nova.accept(beta, built.build.id);
  const reloaded = createNovaLife({ store: new NeonStore(pool), env: ENV });
  const seen = await reloaded.observe(beta);
  assert.equal(Object.values(seen.world.objects).some((object) => object.contributor_gid === 'beta-gid-001'), true);
});

test('google provider stays server-side and fails closed without a router', async () => {
  const nova = engine();
  await assert.rejects(() => nova.ai('image', { prompt: 'falls' }), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(() => nova.ai('video', { prompt: 'descent' }), { code: 'PROVIDER_UNAVAILABLE' });
  await assert.rejects(() => nova.ai('vision', { prompt: 'valley' }), { code: 'PROVIDER_UNAVAILABLE' });
  const router = {
    async generateContent() {
      return { text: 'server plan', model: 'gemini-test', private_key: 'do-not-leak' };
    },
    async generateImage() {
      return { text: 'image-job', model: 'image-test' };
    },
    async generateVideo() {
      return { text: 'video-job', model: 'veo-test' };
    },
  };
  const provided = engine({ provider: new GoogleVertexProvider(router) });
  const text = await provided.ai('text', { prompt: 'describe the falls' });
  const image = await provided.ai('image', { prompt: 'falls' });
  const video = await provided.ai('video', { prompt: 'descent' });
  const encoded = JSON.stringify({ text, image, video });
  assert.equal(text.server_side, true);
  assert.equal(text.credentials_exposed, false);
  assert.equal(encoded.includes('private_key'), false);
  assert.equal(encoded.includes('do-not-leak'), false);
  assert.equal(image.provider, 'google-vertex-ai');
  assert.equal(video.model, 'veo-test');
});

test('n8n is not authoritative and blocks when unconfigured', async () => {
  const blocked = engine();
  const task = await blocked.n8n(beta, 'world.maintain', { region: 'pangea-valley' });
  assert.equal(task.authoritative, false);
  assert.equal(task.authority, 'uae');
  assert.equal(task.status, 'blocked');
  await assert.rejects(() => blocked.n8n(beta, 'gid.grant', {}), { code: 'N8N_NOT_AUTHORITATIVE' });
  let invoked = 0;
  const dispatched = engine({
    env: { N8N_BASE_URL: 'https://n8n.example.test', N8N_API_KEY: 'server-only' },
    executeN8n: async () => {
      invoked += 1;
      return { invocation_id: 'inv-1', result: { ok: true } };
    },
  });
  const sent = await dispatched.n8n(beta, 'forge.background', { build: 'bridge' });
  assert.equal(sent.status, 'dispatched');
  assert.equal(sent.authoritative, false);
  assert.equal(invoked, 1);
  assert.equal(JSON.stringify(sent).includes('server-only'), false);
});

test('thoth rejects broken contributions and maat blocks protected actions', async () => {
  const nova = engine();
  const rejected = nova.verify({ preview: { id: 'x', kind: 'structure', scope: 'personal', owner: 'someone' }, namespace: 'nova-life' });
  assert.equal(rejected.status, 'FAIL');
  const gate = nova.maat({ action: 'production_deploy', confirmed: false });
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, 'HUMAN_APPROVAL_REQUIRED');
  assert.equal(nova.maat({ action: 'build_bridge' }).allowed, true);
  await assert.rejects(
    () => nova.deleteObject(beta, 'canon:solar-falls', { confirmed: false }),
    { code: 'MAAT_BLOCKED' },
  );
  const removed = await nova.deleteObject(beta, 'canon:stone-bridge', { confirmed: true, approvalId: 'approval-1' });
  assert.equal(removed.deleted, 'canon:stone-bridge');
  const restored = await nova.rollback(beta, { lineage_id: removed.lineage.id });
  assert.equal(restored.lineage.action, 'rollback');
  const seen = await nova.observe(beta);
  assert.ok(seen.world.objects['canon:stone-bridge']);
});

test('routes enforce server-side authorization and ignore client beta flags', async () => {
  const nova = engine();
  const closed = await listen(nova, async () => stranger);
  const denied = await fetch(`${closed.base}/nova-life/enter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ experienceAccess: ['nova-life'], beta: true }),
  });
  assert.equal(denied.status, 403);
  await closed.close();

  const open = await listen(nova, async () => beta);
  const entered = await fetch(`${open.base}/nova-life/enter`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ beta: true }),
  });
  assert.equal(entered.status, 200);
  const body = await entered.json();
  assert.equal(body.experience, 'nova-life-live-beta');
  assert.equal(body.credentials_exposed, false);
  const orbit = await fetch(`${open.base}/nova-life/orbit`);
  assert.equal(orbit.status, 200);
  await open.close();
});

test('runtime capability does not trust client experience claims', async () => {
  process.env.NOVA_LIFE_PERSISTENCE = 'memory';
  process.env.NOVA_LIFE_BETA_GIDS = ENV.NOVA_LIFE_BETA_GIDS;
  process.env.SIOS_OWNER_GID = ENV.SIOS_OWNER_GID;
  const runtime = await import(`../nova-life-runtime.js?test=${Date.now()}`);
  await assert.rejects(
    () => runtime.executeNovaCapability({
      capability: 'nova-life',
      gid: 'stranger-gid',
      payload: { experienceAccess: ['nova-life'] },
      context: { experienceAccess: ['nova-life'], tier: 'owner' },
    }),
    { code: 'NOVA_LIFE_ACCESS_DENIED' },
  );
});

test('public tree has no private key material in Nova Life sources', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files = [
    'nova-life',
    'sql/2026-10-13_nova_life_live_beta.sql',
    'scripts/verify-nova-life.mjs',
    '.env.example',
  ];
  const banned = [
    `-----BEGIN ${'RSA'} PRIVATE KEY-----`,
    `-----BEGIN ${'EC'} PRIVATE KEY-----`,
    `-----BEGIN ${'PRIVATE'} KEY-----`,
    `credentials.${'json'}`,
  ];
  for (const relative of files) {
    const target = path.join(root, relative);
    const listing = fs.statSync(target).isDirectory()
      ? fs.readdirSync(target).map((name) => path.join(target, name))
      : [target];
    for (const file of listing) {
      const text = fs.readFileSync(file, 'utf8');
      for (const marker of banned) assert.equal(text.includes(marker), false, `${file} contains ${marker}`);
    }
  }
});

test('nova life modules syntax-check', () => {
  const check = spawnSync(process.execPath, ['--check', 'nova-life/index.js'], { cwd: path.resolve(import.meta.dirname, '..') });
  assert.equal(check.status, 0, check.stderr?.toString());
});
