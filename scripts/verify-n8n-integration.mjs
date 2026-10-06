import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adapter = await readFile(new URL("../n8n-adapter.js", import.meta.url), "utf8");
const capability = await readFile(new URL("../n8n-capability.js", import.meta.url), "utf8");
const fabric = await readFile(new URL("../capability-fabric.js", import.meta.url), "utf8");
const control = await readFile(new URL("../control-plane-gateway.js", import.meta.url), "utf8");

assert.match(capability, /id:\s*"automation\.n8n"/);
assert.match(capability, /requires_registered_workflow:\s*true/);
assert.match(fabric, /N8N_CAPABILITY/);
assert.match(adapter, /resolveRegisteredN8nWorkflow/);
assert.match(adapter, /N8N_WORKFLOW_NOT_REGISTERED/);
assert.match(adapter, /verified: Boolean\(/);
assert.match(control, /executeN8nWorkflow/);
assert.match(control, /resolveRegisteredN8nWorkflow/);
assert.match(control, /capability === "automation\.n8n"/);
assert.match(control, /continuity_events/);

console.log("n8n integration contract verification passed");
