import crypto from 'node:crypto';
import { CANON_OBJECTS, NOVA_LIFE_CANON } from './canon.js';
import { fail } from './access.js';

export function worldDocumentId(worldId) {
  return `world:${worldId}`;
}

export function playerDocumentId(worldId, gid) {
  return `player:${worldId}:${gid}`;
}

export function buildDocumentId(id) {
  return `build:${id}`;
}

export function personalDocumentId(id) {
  return `personal:${id}`;
}

export function ownershipFor(scope, gid) {
  if (scope === 'jahorin' || scope === 'personal') {
    return {
      scope: 'personal',
      owner: gid,
      owner_gid: gid,
      contributor_gid: gid,
      default_visibility: 'private',
      versioned: true,
      lineage: 'required',
      world_owner: null,
    };
  }
  return {
    scope: 'nova-life-world',
    owner: NOVA_LIFE_CANON.owner,
    owner_gid: null,
    contributor_gid: gid,
    default_visibility: NOVA_LIFE_CANON.visibility,
    versioned: true,
    lineage: 'required',
  };
}

export function seedWorld(worldId = NOVA_LIFE_CANON.world_id) {
  const objects = {};
  for (const canon of CANON_OBJECTS) {
    objects[canon.id] = {
      ...canon,
      scope: 'nova-life-world',
      owner: NOVA_LIFE_CANON.owner,
      contributor_gid: 'nova-life-canon',
      origin_contributor_gid: 'nova-life-canon',
      contributors: ['nova-life-canon'],
      visibility: NOVA_LIFE_CANON.visibility,
      version: 1,
      canon: true,
      major_shared_asset: true,
      created_at: null,
      updated_at: null,
    };
  }
  return {
    id: worldDocumentId(worldId),
    kind: 'world',
    namespace: NOVA_LIFE_CANON.namespace,
    world_id: worldId,
    name: worldId === NOVA_LIFE_CANON.world_id ? NOVA_LIFE_CANON.world_name : worldId,
    revision: 1,
    status: 'living',
    regions: NOVA_LIFE_CANON.regions.map((region) => ({ ...region })),
    objects,
    horizon: {
      distant_mountains: true,
      distant_waterfalls: true,
      atmospheric_perspective: true,
      rivers_beyond_horizon: true,
      inaccessible_future_territories: ['the-horizon'],
    },
    ecology: [...NOVA_LIFE_CANON.ecology],
    atmosphere: { ...NOVA_LIFE_CANON.atmosphere },
    palette: { ...NOVA_LIFE_CANON.palette },
    clock: { tick: 0 },
  };
}

export function seedPlayer(worldId, gid) {
  return {
    id: playerDocumentId(worldId, gid),
    kind: 'player',
    namespace: NOVA_LIFE_CANON.namespace,
    world_id: worldId,
    gid,
    revision: 1,
    location_id: 'pangea-valley-shore',
    region: 'pangea-valley',
    first_entry: true,
    entries: 0,
    mode: 'explore',
    module: null,
    active_build_id: null,
    program: NOVA_LIFE_CANON.program,
    cohort: NOVA_LIFE_CANON.cohort,
    experience: NOVA_LIFE_CANON.experience,
  };
}

export async function ensureWorld(store, worldId) {
  const id = worldDocumentId(worldId);
  const existing = await store.getDocument(id);
  if (existing) return existing;
  const seeded = seedWorld(worldId);
  return store.putDocument(seeded);
}

export async function ensurePlayer(store, worldId, gid) {
  const id = playerDocumentId(worldId, gid);
  const existing = await store.getDocument(id);
  if (existing) return existing;
  return store.putDocument(seedPlayer(worldId, gid));
}

export function voiceDock() {
  return {
    id: 'nova-life-voice-dock',
    materials: NOVA_LIFE_CANON.palette.interface,
    edge: NOVA_LIFE_CANON.palette.energy,
    microphone: true,
    waveform: true,
    text_input: true,
    presence: 'nova-life',
    expandable: true,
    modules: [...NOVA_LIFE_CANON.modules],
    augment: false,
    placeholder: 'Speak to Nova Life...',
  };
}

export function publicWorld(world) {
  return {
    world_id: world.world_id,
    name: world.name,
    revision: world.revision,
    namespace: world.namespace,
    status: world.status,
    regions: world.regions,
    horizon: world.horizon,
    ecology: world.ecology,
    atmosphere: world.atmosphere,
    palette: world.palette,
    object_count: Object.keys(world.objects || {}).length,
    objects: world.objects,
  };
}

export async function recordLineage(store, { world, object, action, gid, scope, parentId = null, snapshot }) {
  const entry = {
    id: crypto.randomUUID(),
    world_id: world.world_id,
    object_id: object?.id || null,
    parent_id: parentId,
    revision: world.revision,
    action,
    contributor_gid: gid,
    scope,
    snapshot,
    created_at: new Date().toISOString(),
  };
  await store.appendLineage(entry);
  return entry;
}

export function applyObjectChange(world, object, gid) {
  const contributors = new Set(object.contributors || []);
  if (object.origin_contributor_gid) contributors.add(object.origin_contributor_gid);
  contributors.add(gid);
  const next = {
    ...object,
    contributor_gid: gid,
    origin_contributor_gid: object.origin_contributor_gid || gid,
    contributors: [...contributors],
    version: Number(object.version || 0) + 1,
    updated_at: new Date().toISOString(),
    created_at: object.created_at || new Date().toISOString(),
  };
  world.objects[next.id] = next;
  world.revision = Number(world.revision || 1) + 1;
  world.clock = { tick: Number(world.clock?.tick || 0) + 1 };
  return next;
}

export async function rollbackLineage(store, world, entry, gid) {
  if (!entry) throw fail(404, 'Lineage entry not found', 'LINEAGE_NOT_FOUND');
  if (entry.action === 'rollback') throw fail(409, 'Rollback entries are history, not restore points', 'ROLLBACK_NOT_RESTORABLE');
  const snapshot = entry.snapshot;
  if (!snapshot?.object && !snapshot?.removed_id) throw fail(422, 'Lineage snapshot cannot be restored', 'LINEAGE_UNRESTORABLE');
  const before = snapshot.object ? world.objects[snapshot.object.id] : null;
  if (snapshot.removed_id) {
    delete world.objects[snapshot.removed_id];
  }
  if (snapshot.object) {
    world.objects[snapshot.object.id] = {
      ...snapshot.object,
      contributor_gid: snapshot.object.contributor_gid,
      origin_contributor_gid: snapshot.object.origin_contributor_gid || snapshot.object.contributor_gid,
    };
  }
  world.revision = Number(world.revision || 1) + 1;
  const lineage = await recordLineage(store, {
    world,
    object: snapshot.object || { id: snapshot.removed_id },
    action: 'rollback',
    gid,
    scope: entry.scope,
    parentId: entry.id,
    snapshot: { restored_from: entry.id, previous: before, object: snapshot.object || null },
  });
  await store.putDocument(world);
  return { world, lineage, restored_from: entry.id };
}
