import assert from "node:assert/strict";
import {
  CANONICAL_DEITY_COUNT,
  deityRegistry,
  isCanonicalDeityId,
  isToolEnabledDeityId,
  resolveCanonicalDeity,
} from "../deity-registry.js";

assert.equal(CANONICAL_DEITY_COUNT, 104);
assert.equal(deityRegistry.length, 104);
assert.equal(new Set(deityRegistry.map((entry) => entry.id)).size, 104);
assert.equal(resolveCanonicalDeity("Interweb")?.id, "wepwawet");
assert.equal(resolveCanonicalDeity("Ptah")?.id, "ptah");
assert.equal(resolveCanonicalDeity("Scribe")?.id, "thoth");
assert.equal(resolveCanonicalDeity("Optics")?.id, "horus");
assert.equal(resolveCanonicalDeity("Augment")?.id, "hathor");
assert.equal(isCanonicalDeityId("jahorin-core"), true);
assert.equal(isCanonicalDeityId("not-a-deity"), false);
assert.equal(isToolEnabledDeityId("thoth"), true);
assert.equal(isToolEnabledDeityId("horus"), false);
assert.equal(resolveCanonicalDeity("unknown"), null);

console.log("UAE deity registry checks passed (104 canonical entries; alias and tool-enablement checks passed).");
