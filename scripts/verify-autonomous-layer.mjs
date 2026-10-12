import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  N8N_WORKFLOW_IDS,
  n8nWorkflowPolicy,
} from "../n8n-capability.js";
import { evaluateUaeGovernance } from "../uae-governance.js";
import { verifyN8nExecution } from "../thoth-verifier.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowsDir = path.join(here, "..", "n8n", "workflows");

assert.equal(N8N_WORKFLOW_IDS.length, 8);
for (const id of N8N_WORKFLOW_IDS) {
  const raw = await fs.readFile(path.join(workflowsDir, `${id}.json`), "utf8");
  const workflow = JSON.parse(raw);
  assert.equal(workflow.meta?.jahorin?.workflow_id, id);
  assert.equal(workflow.active, false);
  const webhook = workflow.nodes.find((node) => node.type === "n8n-nodes-base.webhook");
  assert.ok(webhook);
  assert.equal(webhook.parameters.path, `jahorin/${id}`);
  assert.equal(webhook.parameters.authentication, "headerAuth");
  assert.equal(webhook.parameters.responseMode, "responseNode");
}

const safe = evaluateUaeGovernance({
  gid: "jhr_test",
  capability: "automation.n8n",
  operation: "execute",
  body: { workflow_id: "jahorin-research-v1", agent: "jahorin" },
});
assert.equal(safe.allowed, true);
assert.equal(safe.confirmation_required, false);
assert.equal(safe.risk, "low");

const emailDenied = evaluateUaeGovernance({
  gid: "jhr_test",
  capability: "automation.n8n",
  operation: "execute",
  body: { workflow_id: "jahorin-email-v1", agent: "jahorin" },
});
assert.equal(emailDenied.allowed, false);
assert.equal(emailDenied.reason_code, "HUMAN_CONFIRMATION_REQUIRED");

const emailAllowed = evaluateUaeGovernance({
  gid: "jhr_test",
  capability: "automation.n8n",
  operation: "execute",
  body: { workflow_id: "jahorin-email-v1", agent: "jahorin", human_confirmation: true },
});
assert.equal(emailAllowed.allowed, true);

const policy = n8nWorkflowPolicy("jahorin-research-v1");
const verification = verifyN8nExecution({
  workflowId: "jahorin-research-v1",
  policy,
  responseBody: {
    workflow_id: "jahorin-research-v1",
    status: "completed",
    result: { sources: [{ url: "https://example.com" }] },
    evidence: [{ kind: "research_result", source: "wepwawet" }],
  },
  request: { idempotency_key: "test" },
});
assert.equal(verification.verified, true);
assert.equal(verification.agent, "thoth");

const emptyResearch = verifyN8nExecution({
  workflowId: "jahorin-research-v1",
  policy,
  responseBody: {
    workflow_id: "jahorin-research-v1",
    status: "completed",
    result: { sources: [] },
    evidence: [{ kind: "research_result", source: "wepwawet" }],
  },
});
assert.equal(emptyResearch.verified, false);

const falseClaim = verifyN8nExecution({
  workflowId: "jahorin-email-v1",
  policy: n8nWorkflowPolicy("jahorin-email-v1"),
  responseBody: {
    workflow_id: "jahorin-email-v1",
    status: "completed",
    result: {},
    evidence: [],
  },
  request: { idempotency_key: "test2" },
});
assert.equal(falseClaim.verified, false);

console.log("Jahorin autonomous layer verification passed");
