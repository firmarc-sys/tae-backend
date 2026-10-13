import crypto from 'node:crypto';
import { NOVA_LIFE_CANON } from './canon.js';
import {
  allowlistFromEnv,
  assertNovaLifeAccess,
  clientAccessClaimsIgnored,
  identityExperience,
  ownerGidFromEnv,
  sessionFromPrincipal,
} from './access.js';
import { fail } from './access.js';
import { createBuild, classifyIntent, modifyBuild, navigateTarget, testBuild } from './forge.js';
import { evaluateMaat } from './maat.js';
import { enqueueNovaTask } from './n8n.js';
import { createProvider } from './provider.js';
import { createStore } from './store.js';
import { verifyContribution } from './thoth.js';
import {
  applyObjectChange,
  buildDocumentId,
  ensurePlayer,
  ensureWorld,
  personalDocumentId,
  publicWorld,
  recordLineage,
  rollbackLineage,
  voiceDock,
} from './world.js';

function worldIdFrom(payload, env) {
  return String(payload?.worldId || payload?.world_id || env.NOVA_LIFE_WORLD_ID || NOVA_LIFE_CANON.world_id);
}

function scopeFrom(payload) {
  const scope = String(payload?.scope || 'nova-life');
  if (scope === 'jahorin' || scope === 'personal') return 'jahorin';
  return 'nova-life';
}

export function createNovaLife({
  store = createStore(),
  provider = createProvider(null),
  executeN8n = null,
  env = process.env,
} = {}) {
  const accessOptions = () => ({
    allowlist: allowlistFromEnv(env),
    ownerGid: ownerGidFromEnv(env),
  });

  function session(principal) {
    return sessionFromPrincipal(principal);
  }

  function requireAccess(principal) {
    return assertNovaLifeAccess(session(principal), accessOptions());
  }

  async function enter(principal, payload = {}) {
    const decision = requireAccess(principal);
    const ignored = clientAccessClaimsIgnored(payload);
    const worldId = worldIdFrom(payload, env);
    const world = await ensureWorld(store, worldId);
    const player = await ensurePlayer(store, worldId, decision.gid);
    const firstEntry = player.entries === 0 || player.first_entry === true;
    const sequence = firstEntry ? [...NOVA_LIFE_CANON.descent] : [...NOVA_LIFE_CANON.return_sequence];
    player.entries = Number(player.entries || 0) + 1;
    player.first_entry = false;
    player.revision = Number(player.revision || 1) + 1;
    player.experience = decision.experience;
    await store.putDocument(player);
    return {
      kind: 'nova.arrival',
      authenticated: true,
      authorized: true,
      reason: decision.reason,
      program: NOVA_LIFE_CANON.program,
      cohort: NOVA_LIFE_CANON.cohort,
      experience: decision.experience,
      first_entry: firstEntry,
      phase: firstEntry ? 'descent' : 'return',
      sequence,
      branding: {
        title: NOVA_LIFE_CANON.product,
        subtitle: NOVA_LIFE_CANON.subtitle,
        sandbox: NOVA_LIFE_CANON.sandbox,
        phrase: NOVA_LIFE_CANON.phrase,
      },
      voice_dock: voiceDock(),
      world: publicWorld(world),
      player: {
        gid: player.gid,
        location_id: player.location_id,
        region: player.region,
        mode: player.mode,
        module: player.module,
        entries: player.entries,
      },
      login_created: false,
      client_claims: ignored,
    };
  }

  async function observe(principal, payload = {}) {
    const decision = requireAccess(principal);
    const world = await ensureWorld(store, worldIdFrom(payload, env));
    const player = await ensurePlayer(store, world.world_id, decision.gid);
    return {
      kind: 'nova.snapshot',
      experience: decision.experience,
      world: publicWorld(world),
      player,
      voice_dock: voiceDock(),
    };
  }

  async function saveBuild(build) {
    const personal = build.namespace === 'jahorin';
    const id = personal ? personalDocumentId(build.id) : buildDocumentId(build.id);
    await store.putDocument({ ...build, id, build_id: build.id });
    return build;
  }

  async function loadBuild(buildId, gid) {
    const shared = await store.getDocument(buildDocumentId(buildId));
    const personal = await store.getDocument(personalDocumentId(buildId));
    const stored = shared || personal;
    if (!stored) throw fail(404, 'Build not found', 'BUILD_NOT_FOUND');
    if (stored.contributor_gid !== gid && stored.origin_contributor_gid !== gid) {
      throw fail(403, 'Build is not associated with this GID', 'BUILD_CONTRIBUTOR_REQUIRED');
    }
    return { ...stored, id: stored.build_id || buildId };
  }

  async function forgeIntent(principal, utterance, payload = {}) {
    const decision = requireAccess(principal);
    const worldId = worldIdFrom(payload, env);
    const world = await ensureWorld(store, worldId);
    const player = await ensurePlayer(store, worldId, decision.gid);
    const scope = scopeFrom(payload);
    let providerNote = { used: false, provider: 'none', generator: 'forge-spatial-compiler' };
    const health = await provider.health();
    if (health.configured) {
      try {
        const enriched = await provider.generateText({
          prompt: `Plan a Nova Life forge action without credentials: ${utterance}`,
          context: { gid: decision.gid, capability: 'forge' },
        });
        providerNote = { used: true, provider: enriched.provider, credentials_exposed: false, text: enriched.text };
      } catch (error) {
        providerNote = { used: false, provider: 'google-vertex-ai', status: 'unavailable', code: error.code || 'PROVIDER_UNAVAILABLE' };
      }
    }
    const build = createBuild({
      utterance,
      gid: decision.gid,
      locationId: payload.location_id || player.location_id,
      worldId,
      scope,
      providerNote,
    });
    await saveBuild(build);
    player.mode = 'build';
    player.active_build_id = build.id;
    player.module = 'forge';
    await store.putDocument(player);
    return {
      kind: 'nova.forge.preview',
      experience: decision.experience,
      mode: 'build',
      build,
      world_mutated: false,
      ownership: {
        scope: build.scope,
        owner: build.owner,
        contributor_gid: build.contributor_gid,
        visibility: build.visibility,
      },
    };
  }

  async function accept(principal, buildId) {
    const decision = requireAccess(principal);
    const build = await loadBuild(buildId, decision.gid);
    const verification = verifyContribution(build);
    if (!verification.passed) {
      const error = fail(422, 'Thoth rejected the contribution', 'THOTH_REJECTED');
      error.verification = verification;
      throw error;
    }
    build.verification = verification;
    if (build.namespace === 'jahorin') {
      build.accepted = true;
      build.lifecycle_stage = 'VERSION';
      build.persisted_to_world = false;
      await saveBuild(build);
      return {
        kind: 'nova.forge.personal',
        accepted: true,
        world_mutated: false,
        build,
        verification,
      };
    }
    const world = await ensureWorld(store, build.world_id || worldIdFrom({}, env));
    const previous = world.objects[build.preview.id] || null;
    const object = applyObjectChange(world, { ...build.preview, status: 'accepted', world_id: world.world_id }, decision.gid);
    const lineage = await recordLineage(store, {
      world,
      object,
      action: 'accept',
      gid: decision.gid,
      scope: 'nova-life-world',
      snapshot: { object: previous, removed_id: previous ? null : object.id },
    });
    await store.putDocument(world);
    build.accepted = true;
    build.persisted_to_world = true;
    build.lifecycle_stage = 'VERSION';
    build.lineage_id = lineage.id;
    build.preview = object;
    await saveBuild(build);
    const player = await ensurePlayer(store, world.world_id, decision.gid);
    player.mode = 'explore';
    player.active_build_id = build.id;
    await store.putDocument(player);
    return {
      kind: 'nova.forge.accepted',
      accepted: true,
      world_mutated: true,
      world_revision: world.revision,
      object,
      lineage,
      verification,
      contributor_gid: decision.gid,
    };
  }

  async function intent(principal, text, payload = {}) {
    const classified = classifyIntent(text);
    if (classified.kind === 'empty') throw fail(422, 'Intent is required', 'INTENT_REQUIRED');
    if (classified.kind === 'forge') return forgeIntent(principal, classified.utterance, payload);
    const decision = requireAccess(principal);
    const worldId = worldIdFrom(payload, env);
    const world = await ensureWorld(store, worldId);
    const player = await ensurePlayer(store, worldId, decision.gid);
    if (classified.kind === 'who-built') {
      const objectId = payload.object_id || payload.objectId;
      const object = objectId
        ? world.objects[objectId]
        : Object.values(world.objects).find((item) => item.location_id === player.location_id) || null;
      return {
        kind: 'nova.query.builder',
        object_id: object?.id || null,
        contributor_gid: object?.contributor_gid || null,
        origin_contributor_gid: object?.origin_contributor_gid || null,
        contributors: object?.contributors || [],
        owner: object?.owner || null,
      };
    }
    if (classified.kind === 'what-changed') {
      const lineage = await store.listLineage(world.world_id, 20);
      return { kind: 'nova.query.lineage', lineage };
    }
    if (classified.kind === 'undo') return rollbackOwnLast(principal, payload);
    if (classified.kind === 'test') {
      const buildId = payload.build_id || player.active_build_id;
      const build = testBuild(await loadBuild(buildId, decision.gid));
      await saveBuild(build);
      player.mode = 'play';
      await store.putDocument(player);
      return { kind: 'nova.forge.play', mode: 'play', build_id: build.id, play_contract: build.play_contract };
    }
    if (classified.kind === 'continue') {
      if (!player.active_build_id) throw fail(404, 'No unfinished Nova Life build for this GID', 'NO_ACTIVE_BUILD');
      const build = await loadBuild(player.active_build_id, decision.gid);
      player.mode = 'build';
      player.module = 'forge';
      await store.putDocument(player);
      return { kind: 'nova.forge.continue', mode: 'build', build };
    }
    if (classified.kind === 'navigate') {
      const destination = navigateTarget(classified.target);
      player.module = destination.module;
      player.region = destination.region;
      player.location_id = destination.region;
      player.mode = destination.mode;
      await store.putDocument(player);
      return { kind: 'nova.navigate', destination, player: { gid: player.gid, region: player.region, module: player.module, mode: player.mode } };
    }
    if (classified.kind === 'accept') {
      const buildId = payload.build_id || player.active_build_id;
      return accept(principal, buildId);
    }
    throw fail(422, 'Intent was not understood', 'INTENT_UNSUPPORTED');
  }

  async function rollbackOwnLast(principal, payload = {}) {
    const decision = requireAccess(principal);
    const world = await ensureWorld(store, worldIdFrom(payload, env));
    if (payload.lineage_id || payload.lineageId) {
      const entry = await store.getLineage(payload.lineage_id || payload.lineageId);
      if (entry && entry.contributor_gid !== decision.gid) {
        throw fail(403, 'A GID can only roll back its own contribution', 'ROLLBACK_CONTRIBUTOR_REQUIRED');
      }
      return rollbackLineage(store, world, entry, decision.gid);
    }
    const lineage = await store.listLineage(world.world_id, 100);
    const own = lineage.find((entry) => entry.contributor_gid === decision.gid && entry.action !== 'rollback');
    if (!own) throw fail(404, 'No contribution by this GID to roll back', 'ROLLBACK_NOT_FOUND');
    return rollbackLineage(store, world, own, decision.gid);
  }

  async function deleteObject(principal, objectId, { confirmed = false, approvalId = null } = {}) {
    const decision = requireAccess(principal);
    const world = await ensureWorld(store, worldIdFrom({}, env));
    const object = world.objects[objectId];
    if (!object) throw fail(404, 'World object not found', 'OBJECT_NOT_FOUND');
    if (object.canon || object.major_shared_asset) {
      const gate = evaluateMaat({
        action: 'destructive_delete_major_shared_asset',
        confirmed,
        approvalId,
      });
      if (!gate.allowed) {
        const error = fail(403, 'Ma\'at blocks destructive deletion of major shared assets', 'MAAT_BLOCKED');
        error.governance = gate;
        throw error;
      }
    }
    const removed = object;
    delete world.objects[objectId];
    world.revision = Number(world.revision || 1) + 1;
    const lineage = await recordLineage(store, {
      world,
      object: removed,
      action: 'delete',
      gid: decision.gid,
      scope: removed.scope || 'nova-life-world',
      snapshot: { removed_id: objectId, object: removed },
    });
    await store.putDocument(world);
    return { deleted: objectId, lineage, contributor_gid: removed.contributor_gid };
  }

  return {
    store,
    provider,
    identityContract(principal) {
      return identityExperience(principal, accessOptions());
    },
    orbit() {
      return {
        experience: 'orbit',
        phase: 'orbit',
        branding: {
          title: NOVA_LIFE_CANON.product,
          subtitle: NOVA_LIFE_CANON.subtitle,
          sandbox: NOVA_LIFE_CANON.sandbox,
          phrase: NOVA_LIFE_CANON.phrase,
        },
        planet: { id: 'nova-life', view: 'space', entry_object: true },
        authentication: 'existing-gid',
        login_created: false,
        signed_in_ground: false,
      };
    },
    enter,
    observe,
    intent,
    accept,
    async modify(principal, buildId, patch) {
      const decision = requireAccess(principal);
      const build = modifyBuild(await loadBuild(buildId, decision.gid), patch, decision.gid);
      await saveBuild(build);
      return { kind: 'nova.forge.modified', mode: 'build', build, world_mutated: false };
    },
    async test(principal, buildId) {
      return intent(principal, 'Test this', { build_id: buildId });
    },
    rollback: rollbackOwnLast,
    deleteObject,
    async ai(capability, input) {
      const method = {
        text: 'generateText',
        stream: 'streamText',
        vision: 'analyzeVision',
        image: 'generateImage',
        video: 'generateVideo',
        embed: 'embed',
      }[capability];
      if (!method) throw fail(404, 'Unknown provider capability', 'PROVIDER_CAPABILITY_UNKNOWN');
      return provider[method](input);
    },
    async n8n(principal, workflowId, payload) {
      const decision = requireAccess(principal);
      return enqueueNovaTask({
        store,
        workflowId,
        gid: decision.gid,
        payload,
        execute: executeN8n,
        env,
      });
    },
    verify(build) {
      return verifyContribution(build);
    },
    maat(input) {
      return evaluateMaat(input);
    },
    async health() {
      const providerHealth = await provider.health();
      return {
        ok: true,
        product: NOVA_LIFE_CANON.product,
        phrase: NOVA_LIFE_CANON.phrase,
        persistence: store.constructor.name,
        provider: providerHealth,
        credentials_exposed: false,
        login_created: false,
      };
    },
  };
}

let singleton = null;

export function getNovaLife(options) {
  if (options) return createNovaLife(options);
  if (!singleton) singleton = createNovaLife();
  return singleton;
}

export function resetNovaLife() {
  singleton = null;
}
