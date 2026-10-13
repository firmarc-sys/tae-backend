import crypto from 'node:crypto';
import { fail } from './access.js';
import { ownershipFor } from './world.js';

const LIFECYCLE = Object.freeze([
  'INTENT',
  'PLAN',
  'GENERATE',
  'PREVIEW',
  'MODIFY',
  'TEST',
  'ACCEPT',
  'PERSIST',
  'VERSION',
]);

const MODULE_ALIASES = Object.freeze({
  interweb: 'the-interweb-gate',
  code: 'code-citadel',
  scribe: 'the-archive',
  thoth: 'the-archive',
  optics: 'the-observatory',
  archive: 'the-archive',
});

export function classifyIntent(text) {
  const utterance = String(text || '').trim();
  const lower = utterance.toLowerCase();
  if (!utterance) return { kind: 'empty' };
  if (/^who built this\b/.test(lower)) return { kind: 'who-built' };
  if (/what changed/.test(lower)) return { kind: 'what-changed' };
  if (/^undo my last change\b|^undo\b/.test(lower)) return { kind: 'undo' };
  if (/^test (this|it)\b/.test(lower)) return { kind: 'test' };
  if (/^continue what i was building\b|^continue\b/.test(lower)) return { kind: 'continue' };
  if (/^take me to\b/.test(lower)) {
    const target = lower.replace(/^take me to\s+/, '').replace(/\.$/, '');
    return { kind: 'navigate', target };
  }
  if (/^accept\b/.test(lower)) return { kind: 'accept' };
  return { kind: 'forge', utterance };
}

export function planFromUtterance(utterance, locationId) {
  const lower = utterance.toLowerCase();
  const plan = {
    utterance,
    lifecycle: LIFECYCLE,
    generator: 'forge-spatial-compiler',
    location_id: locationId,
    type: 'object',
    dependencies: [],
    orchestrates: [],
  };
  if (/survival game/.test(lower)) {
    plan.type = 'game';
    plan.genre = 'survival';
    plan.dependencies = ['code', 'scribe'];
  } else if (/racing course/.test(lower)) {
    plan.type = 'game';
    plan.genre = 'racing';
    plan.anchor = 'valley';
    plan.dependencies = ['code'];
  } else if (/temple/.test(lower)) {
    plan.type = 'structure';
    plan.structure = 'temple';
    plan.anchor = /mountain/.test(lower) ? 'mountain' : locationId;
  } else if (/bridge/.test(lower)) {
    plan.type = 'structure';
    plan.structure = 'bridge';
  } else if (/cave/.test(lower)) {
    plan.type = 'space';
    plan.space = 'cave';
    plan.playable = /playable/.test(lower);
  } else if (/creature/.test(lower)) {
    plan.type = 'creature';
    plan.biome = /forest/.test(lower) ? 'forest' : 'pangea-valley';
    plan.dependencies = ['optics'];
  } else if (/multiplayer/.test(lower)) {
    plan.type = 'multiplayer';
    plan.dependencies = ['code'];
  } else {
    plan.type = 'structure';
    plan.structure = 'custom';
  }
  if (/island/.test(lower)) plan.anchor = plan.anchor || 'island';
  plan.orchestrates = [...plan.dependencies];
  return plan;
}

export function compilePreview(plan, gid, scope = 'nova-life') {
  const ownership = ownershipFor(scope, gid);
  const id = `forge:${crypto.randomUUID()}`;
  return {
    id,
    kind: plan.type,
    name: plan.structure || plan.genre || plan.space || plan.type,
    region: plan.anchor === 'mountain' ? 'pangea-valley' : 'pangea-valley',
    location_id: plan.location_id,
    anchor: plan.anchor || plan.location_id,
    genre: plan.genre || null,
    playable: Boolean(plan.playable || plan.type === 'game' || plan.type === 'multiplayer'),
    multiplayer: plan.type === 'multiplayer' || /multiplayer/.test(plan.utterance.toLowerCase()),
    materials: ['glass', 'stone', 'luminous-blue', 'solar-gold'],
    ecology: plan.type === 'creature' ? ['bioluminescent-plant-life', plan.biome] : [],
    script: {
      source: 'forge-spatial-compiler',
      intent: plan.utterance,
      mechanics: plan.type === 'game' ? [plan.genre, 'build-mode', 'play-mode'] : [],
    },
    ...ownership,
    canon: false,
    major_shared_asset: false,
    version: 1,
    status: 'preview',
  };
}

export function createBuild({ utterance, gid, locationId, worldId = 'pangea-valley', scope = 'nova-life', providerNote = null }) {
  const plan = planFromUtterance(utterance, locationId);
  const preview = compilePreview(plan, gid, scope);
  preview.world_id = worldId;
  const id = crypto.randomUUID();
  return {
    id,
    kind: 'build',
    world_id: worldId,
    namespace: scope === 'jahorin' || scope === 'personal' ? 'jahorin' : 'nova-life',
    lifecycle_stage: 'PREVIEW',
    lifecycle: LIFECYCLE,
    mode: 'build',
    status: 'preview',
    accepted: false,
    persisted_to_world: false,
    plan,
    preview,
    provider: providerNote,
    contributor_gid: gid,
    origin_contributor_gid: gid,
    scope: preview.scope,
    owner: preview.owner,
    visibility: preview.default_visibility,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function modifyBuild(build, patch, gid) {
  if (!build) throw fail(404, 'Build not found', 'BUILD_NOT_FOUND');
  if (build.accepted) throw fail(409, 'Accepted builds are modified by a new forge intent', 'BUILD_ALREADY_ACCEPTED');
  if (build.contributor_gid !== gid && build.origin_contributor_gid !== gid) {
    throw fail(403, 'Only the contributing GID can modify this preview', 'BUILD_CONTRIBUTOR_REQUIRED');
  }
  const nextPreview = {
    ...build.preview,
    ...(patch.preview || {}),
    name: patch.name || build.preview.name,
    contributor_gid: gid,
    origin_contributor_gid: build.preview.origin_contributor_gid || gid,
  };
  if (patch.utterance) nextPreview.script = { ...nextPreview.script, modification: patch.utterance };
  return {
    ...build,
    preview: nextPreview,
    lifecycle_stage: 'MODIFY',
    version: Number(build.version || 1) + 1,
    updated_at: new Date().toISOString(),
  };
}

export function testBuild(build) {
  if (!build) throw fail(404, 'Build not found', 'BUILD_NOT_FOUND');
  return {
    ...build,
    lifecycle_stage: 'TEST',
    mode: 'play',
    play_contract: {
      mode: 'play',
      build_id: build.id,
      accepted: false,
      world_mutated: false,
      experience: build.preview,
      message: 'Play Mode is running the preview. The shared world is unchanged until accept.',
    },
  };
}

export function navigateTarget(target) {
  const key = String(target || '').trim().toLowerCase();
  if (key === 'forge' || key === 'the forge') return { module: 'forge', region: 'the-forge', mode: 'build' };
  if (key === 'code' || key === 'code citadel') return { module: 'code', region: 'code-citadel', mode: 'explore' };
  if (key === 'scribe' || key === 'the archive' || key === 'archive') return { module: 'scribe', region: 'the-archive', mode: 'explore' };
  if (key === 'optics' || key === 'the observatory' || key === 'observatory') return { module: 'optics', region: 'the-observatory', mode: 'explore' };
  if (key === 'interweb' || key === 'the interweb gate') return { module: 'interweb', region: 'the-interweb-gate', mode: 'explore' };
  if (MODULE_ALIASES[key]) {
    const region = MODULE_ALIASES[key];
    return { module: key, region, mode: key === 'forge' ? 'build' : 'explore' };
  }
  throw fail(404, `Nova Life has no region named ${target}`, 'REGION_NOT_FOUND');
}
