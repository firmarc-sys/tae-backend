import assert from "node:assert/strict";
import {
  UAE_GOVERNANCE_VERSION,
  evaluateUaeGovernance,
  classifyGovernanceRisk,
  publicGovernanceManifest,
} from "../uae-governance.js";

assert.equal(UAE_GOVERNANCE_VERSION, "uae-governance-v1");
assert.equal(classifyGovernanceRisk("interweb", "search"), "low");
assert.equal(classifyGovernanceRisk("code", "deploy"), "high");
assert.equal(classifyGovernanceRisk("novafin", "transfer"), "high");
assert.equal(classifyGovernanceRisk("novalife", "execute"), "moderate");

const lowRisk = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "interweb",
  operation: "search",
  body: { agent: "wepwawet", intent_id: "intent-search" },
  requestId: "req-search",
});
assert.equal(lowRisk.allowed, true);
assert.equal(lowRisk.confirmation_required, false);
assert.equal(lowRisk.jurisdiction.primary, "wepwawet");

const moderateRisk = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "novalife",
  operation: "execute",
  body: { agent: "hathor", intent_id: "intent-context" },
  requestId: "req-context",
});
assert.equal(moderateRisk.allowed, true);
assert.equal(moderateRisk.confirmation_required, false);

const highRiskDenied = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "code",
  operation: "deploy",
  body: { agent: "ptah", intent_id: "intent-deploy" },
  requestId: "req-deploy",
});
assert.equal(highRiskDenied.allowed, false);
assert.equal(highRiskDenied.reason_code, "HUMAN_CONFIRMATION_REQUIRED");
assert.equal(highRiskDenied.confirmation_required, true);

const highRiskConfirmed = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "code",
  operation: "deploy",
  body: { agent: "ptah", user_confirmation: true, intent_id: "intent-deploy" },
  requestId: "req-deploy",
});
assert.equal(highRiskConfirmed.allowed, true);
assert.equal(highRiskConfirmed.human_confirmed, true);

const jurisdictionDenied = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "optics",
  operation: "analyze",
  body: { agent: "hephaestus" },
});
assert.equal(jurisdictionDenied.allowed, false);
assert.equal(jurisdictionDenied.reason_code, "GOVERNANCE_JURISDICTION_VIOLATION");

const unknownDenied = evaluateUaeGovernance({
  gid: "399152573423",
  capability: "unknown-capability",
  operation: "execute",
  body: {},
});
assert.equal(unknownDenied.allowed, false);
assert.equal(unknownDenied.reason_code, "GOVERNANCE_JURISDICTION_UNDEFINED");

const manifest = publicGovernanceManifest();
assert.equal(manifest.ok, true);
assert.equal(manifest.constitution.sovereignty, "The United Agentic Ecosystem governs agents, never the human.");
assert.ok(manifest.constitution.rights.includes("revoke_authority"));

console.log("UAE governance verification passed");
