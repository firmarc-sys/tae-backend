/**
 * UAE canonical deity registry for the Node.js TAE/ARI backend.
 * Source: firmarc-sys/uae/src/pantheon/deityRoster.ts
 *
 * Registry membership describes canonical identity and jurisdiction, NOT proof
 * that every deity has executable tools. Only toolEnabledDeityIds are verified
 * as having a production Tool Fabric implementation in the source contract.
 */
import registry from "./deity-registry.json" with { type: "json" };

const byId = new Map(registry.deities.map((deity) => [deity.id, Object.freeze(deity)]));
const byName = new Map(registry.deities.map((deity) => [deity.name.toLowerCase(), deity.id]));

export const DEITY_REGISTRY_VERSION = registry.schemaVersion;
export const CANONICAL_DEITY_COUNT = registry.canonicalCount;
export const TOOL_ENABLED_DEITY_IDS = Object.freeze([...registry.toolEnabledDeityIds]);
export const deityRegistry = Object.freeze(registry.deities);
export const deityRegistryById = byId;

const CAPABILITY_ALIASES = Object.freeze({
  jahorin: "jahorin-core",
  core: "jahorin-core",
  interweb: "wepwawet",
  web: "wepwawet",
  ptah: "ptah",
  code: "ptah",
  "intent-to-code": "ptah",
  thoth: "thoth",
  scribe: "thoth",
  horus: "horus",
  optics: "horus",
  hathor: "hathor",
  augment: "hathor",
});

export function resolveCanonicalDeity(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
  const id = CAPABILITY_ALIASES[key] ?? (byId.has(key) ? key : byName.get(key));
  return id ? byId.get(id) ?? null : null;
}

export function isCanonicalDeityId(value) {
  return byId.has(String(value ?? "").trim().toLowerCase());
}

export function isToolEnabledDeityId(value) {
  return TOOL_ENABLED_DEITY_IDS.includes(String(value ?? "").trim().toLowerCase());
}

if (deityRegistry.length !== CANONICAL_DEITY_COUNT || deityRegistry.length !== 104) {
  throw new Error(`UAE deity registry invariant failed: expected 104 entries, got ${deityRegistry.length}`);
}
