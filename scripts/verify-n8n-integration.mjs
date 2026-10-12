import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adapter = await readFile(new URL("../n8n-adapter.js", import.meta.url), "utf8");
const capability = await readFile(new URL("../n8n-capability.js", import.meta.url), "utf8");
const fabric = await readFile(new URL("../capability-fabric.js", import.meta.url), "utf8");
const control = await readFile(new URL("../control-plane-gateway.js", import.meta.url), "utf8");
const verifier = await readFile(new URL("../thoth-verifier.js", import.meta.url), "utf8");
const memory = await readFile(new URL("../jahorin-memory.js", import.meta.url), "utf8");

assert.match(capability, /id:\s*"automation\.n8n"/);
assert.match(capability, /requires_registered_workflow:\s*true/);
assert.match(capability, /jahorin-email-v1/);
assert.match(capability, /completion_gate:\s*"thoth"/);
assert.match(fabric, /N8N_CAPABILITY/);
assert.match(adapter, /resolveRegisteredN8nWorkflow/);
assert.match(adapter, /N8N_WORKFLOW_NOT_REGISTERED/);
assert.match(adapter, /verifyN8nExecution/);
assert.match(adapter, /automation_invocations/);
assert.match(adapter, /autonomy_approvals/);
assert.match(control, /executeN8nWorkflow/);
assert.match(control, /resolveRegisteredN8nWorkflow/);
assert.match(control, /capability === "automation\.n8n"/);
assert.match(control, /continuity_events/);
assert.match(verifier, /THOTH_VERIFIER_VERSION/);
assert.match(memory, /recallJahorinMemory/);

console.log("n8n integration contract verification passed");
