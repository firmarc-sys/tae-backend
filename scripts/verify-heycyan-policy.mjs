import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HEYCYAN_DEVICE_LANE,
  HEYCYAN_POLICY_VERSION,
  SIAAS_MARKET_CATEGORY,
  inferHeyCyanOperation,
  isHeyCyanIntent,
  normalizeHeyCyanCommand,
  resolveHeyCyanOperation,
} from "../heycyan-policy.js";

const now = Date.parse("2026-09-11T15:00:00.000Z");
const baseMutation = {
  operation: "glasses.media.sync",
  device_id: "heycyan-demo-01",
  request_id: "0d68e675-42ae-4973-a69e-1eebc6d7cace",
  idempotency_key: "c759e916-e81f-4bfd-b63c-a5adfced30be",
  issued_at: "2026-09-11T15:00:00.000Z",
  expires_at: "2026-09-11T15:02:00.000Z",
  parameters: { import_mode: "media_store" },
};

function expectPolicyError(callback, code) {
  assert.throws(callback, (error) => error?.code === code);
}

assert.equal(HEYCYAN_POLICY_VERSION, "heycyan-policy-2026-09-11");
assert.equal(SIAAS_MARKET_CATEGORY.name, "System Intelligence as a Service");
assert.equal(HEYCYAN_DEVICE_LANE.module.market_category.abbreviation, "S.I.aaS");
assert.equal(HEYCYAN_DEVICE_LANE.android_companion.target_sdk, 36);
assert.equal(HEYCYAN_DEVICE_LANE.classification.android_xr_device, false);
assert.equal(HEYCYAN_DEVICE_LANE.cyanbridge_adoption.use_entire_application, false);
assert.equal(HEYCYAN_DEVICE_LANE.firmware.update_enabled, false);
assert.deepEqual(HEYCYAN_DEVICE_LANE.firmware.verified_experimental_profiles, []);
assert.equal(HEYCYAN_DEVICE_LANE.transfer.enter_transfer_command_hex, "02 01 04");
assert.equal(HEYCYAN_DEVICE_LANE.transfer.ip_notification_type, "0x08");
assert.equal(HEYCYAN_DEVICE_LANE.transfer.manifest_path, "/files/media.config");
assert.equal(HEYCYAN_DEVICE_LANE.transfer.reject_group_owner_as_device_ip, true);
assert.equal(HEYCYAN_DEVICE_LANE.transport_boundary.local_media_urls_may_cross_ari, false);
assert.ok(HEYCYAN_DEVICE_LANE.android_companion.excluded_surfaces.includes("accessibility_automation"));
assert.ok(HEYCYAN_DEVICE_LANE.android_companion.excluded_permissions.includes("MANAGE_EXTERNAL_STORAGE"));

assert.equal(isHeyCyanIntent("Connect my HeyCyan glasses"), true);
assert.equal(isHeyCyanIntent("Open Jahorin Optics Bridge"), true);
assert.equal(isHeyCyanIntent("Write a document"), false);
assert.equal(inferHeyCyanOperation("Sync media from my smart glasses"), "glasses.media.sync");
assert.equal(inferHeyCyanOperation("Stop glasses speech capture"), "glasses.speech.stop");
assert.equal(inferHeyCyanOperation("Inspect HeyCyan firmware"), "glasses.firmware.inspect");

const command = normalizeHeyCyanCommand(baseMutation, { gid: "399152573423", humanConfirmed: true, now });
assert.equal(command.operation, "glasses.media.sync");
assert.equal(command.execution, "awaiting_companion");
assert.equal(command.executed, false);
assert.equal(command.gid, "399152573423");
assert.match(command.command_id, /^hcy_[0-9a-f]{32}$/);
assert.equal(command.authorization.human_confirmed, true);
assert.ok(command.required_capabilities.includes("nearby_wifi_devices"));
assert.ok(command.required_capabilities.includes("notifications"));

const inspection = normalizeHeyCyanCommand({
  operation: "glasses.firmware.inspect",
  device_id: "heycyan-demo-01",
  issued_at: "2026-09-11T15:00:00.000Z",
  expires_at: "2026-09-11T15:01:00.000Z",
}, { requestId: "server-request-id", now });
assert.equal(inspection.request_id, "server-request-id");
assert.equal(inspection.confirmation_required, false);
assert.equal("idempotency_key" in inspection, false);

const duplicateCommand = normalizeHeyCyanCommand(baseMutation, { gid: "399152573423", humanConfirmed: true, now });
assert.equal(duplicateCommand.command_id, command.command_id);

expectPolicyError(
  () => normalizeHeyCyanCommand(baseMutation, { now }),
  "HUMAN_CONFIRMATION_REQUIRED",
);
expectPolicyError(
  () => normalizeHeyCyanCommand({ ...baseMutation, idempotency_key: "" }, { humanConfirmed: true, now }),
  "IDEMPOTENCY_KEY_REQUIRED",
);
expectPolicyError(
  () => normalizeHeyCyanCommand({ ...baseMutation, expires_at: "2026-09-11T14:58:00.000Z" }, { humanConfirmed: true, now }),
  "COMMAND_EXPIRED",
);
expectPolicyError(
  () => normalizeHeyCyanCommand({ ...baseMutation, parameters: { media_url: "http://192.168.49.1/files/a.jpg" } }, { humanConfirmed: true, now }),
  "LOCAL_TRANSPORT_DATA_FORBIDDEN",
);
expectPolicyError(
  () => normalizeHeyCyanCommand({ ...baseMutation, parameters: { endpoint: "192.168.49.2" } }, { humanConfirmed: true, now }),
  "LOCAL_TRANSPORT_DATA_FORBIDDEN",
);
expectPolicyError(
  () => resolveHeyCyanOperation({ operation: "glasses.firmware.update" }),
  "FIRMWARE_UPDATE_DISABLED",
);
expectPolicyError(
  () => normalizeHeyCyanCommand({ ...baseMutation, operation: "glasses.ai_photo.capture" }, { humanConfirmed: true, now }),
  "EXPERIMENTAL_OPERATION_DISABLED",
);

const [serverSource, secureSource, governanceSource] = await Promise.all([
  readFile(new URL("../server.js", import.meta.url), "utf8"),
  readFile(new URL("../secure-gateway.js", import.meta.url), "utf8"),
  readFile(new URL("../governance-gateway.js", import.meta.url), "utf8"),
]);
assert.match(serverSource, /status: "awaiting_companion"/);
assert.match(serverSource, /normalizeHeyCyanCommand/);
assert.match(serverSource, /manifest\.device_lane\?\.id === "heycyan" && !inlineImage/);
assert.match(secureSource, /"\/api\/iot", "\/iot"/);
assert.match(governanceSource, /capabilityOverride: "iot"/);

console.log("HeyCyan Optics Bridge policy verification passed");
