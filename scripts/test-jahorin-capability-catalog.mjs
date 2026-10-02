import test from "node:test";
import assert from "node:assert/strict";
import { getJahorinCapability, listJahorinCapabilities, JAHORIN_CAPABILITY_CATALOG } from "../jahorin-capability-catalog.js";

test("catalog defines primary provider-backed capabilities and required adapters", () => {
  for (const id of ["system.orchestrate", "web.research", "software.code", "documents.scribe", "media.image", "media.audio", "media.video"]) {
    assert.ok(getJahorinCapability(id), id);
    assert.equal(getJahorinCapability(id).status, "available", id);
  }
  for (const id of ["files.manage", "compute.code", "compute.shell", "browser.session", "memory.profile", "workflow.orchestrate", "communications.email", "communications.calendar", "device.camera", "cloud.deploy", "identity.access"]) {
    assert.equal(getJahorinCapability(id)?.status, "adapter_required", id);
    assert.ok(getJahorinCapability(id).adapter, id);
  }
});

test("every capability declares operations and classifies side effects", () => {
  for (const [id, capability] of Object.entries(JAHORIN_CAPABILITY_CATALOG)) {
    assert.ok(capability.label, id);
    assert.ok(capability.deity, id);
    assert.ok(capability.adapter, id);
    assert.ok(Array.isArray(capability.operations) && capability.operations.length > 0, id);
    assert.ok(["none", "external-read", "persistent-write", "isolated-compute", "external-write", "device-access", "high-impact-write", "security-write", "financial-write"].includes(capability.sideEffects), id);
  }
});

test("catalog filtering is complete and unknown capabilities stay unknown", () => {
  const available = listJahorinCapabilities({ status: "available" });
  const required = listJahorinCapabilities({ status: "adapter_required" });
  assert.ok(available.length >= 7);
  assert.ok(required.length >= 15);
  assert.equal(available.length + required.length, Object.keys(JAHORIN_CAPABILITY_CATALOG).length);
  assert.equal(getJahorinCapability("not.real"), null);
});
