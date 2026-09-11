import crypto from "node:crypto";

export const SIAAS_MARKET_CATEGORY = Object.freeze({
  id: "siaas",
  name: "System Intelligence as a Service",
  abbreviation: "S.I.aaS",
});

export const HEYCYAN_POLICY_VERSION = "heycyan-policy-2026-09-11";

const NORMALIZED_STATES = Object.freeze([
  "unavailable",
  "scanning",
  "pairing",
  "connecting",
  "profile_incomplete",
  "permission_required",
  "capability_unavailable",
  "ready",
  "capturing_photo",
  "recording_video",
  "streaming_speech",
  "preparing_transfer",
  "transferring",
  "recovering",
  "disconnecting",
  "error",
]);

const OPERATION_REGISTRY = Object.freeze({
  "glasses.state.inspect": Object.freeze({
    mode: "read",
    confirmation_required: false,
    required_capabilities: [],
  }),
  "glasses.connect": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_scan", "bluetooth_connect"],
  }),
  "glasses.disconnect": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.capture.photo": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.video.start": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.video.stop": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.speech.start": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect", "microphone"],
  }),
  "glasses.speech.stop": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.media.sync": Object.freeze({
    mode: "basic",
    confirmation_required: true,
    required_capabilities: [
      "bluetooth_scan",
      "bluetooth_connect",
      "nearby_wifi_devices",
      "notifications",
      "media_store_write",
    ],
  }),
  "glasses.firmware.inspect": Object.freeze({
    mode: "read",
    confirmation_required: false,
    required_capabilities: ["bluetooth_connect"],
  }),
  "glasses.ai_photo.capture": Object.freeze({
    mode: "experimental",
    confirmation_required: true,
    required_capabilities: ["bluetooth_connect"],
  }),
});

const OPERATION_ALIASES = Object.freeze({
  status: "glasses.state.inspect",
  inspect: "glasses.state.inspect",
  connect: "glasses.connect",
  pair: "glasses.connect",
  disconnect: "glasses.disconnect",
  photo: "glasses.capture.photo",
  capture_photo: "glasses.capture.photo",
  "capture.photo": "glasses.capture.photo",
  video_start: "glasses.video.start",
  "video.start": "glasses.video.start",
  video_stop: "glasses.video.stop",
  "video.stop": "glasses.video.stop",
  speech_start: "glasses.speech.start",
  "speech.start": "glasses.speech.start",
  speech_stop: "glasses.speech.stop",
  "speech.stop": "glasses.speech.stop",
  sync: "glasses.media.sync",
  media_sync: "glasses.media.sync",
  "media.sync": "glasses.media.sync",
  firmware: "glasses.firmware.inspect",
  firmware_inspect: "glasses.firmware.inspect",
  "firmware.inspect": "glasses.firmware.inspect",
  ai_photo: "glasses.ai_photo.capture",
  firmware_update: "glasses.firmware.update",
  "firmware.update": "glasses.firmware.update",
});

const READ_ONLY_OPERATIONS = new Set([
  "glasses.state.inspect",
  "glasses.firmware.inspect",
]);

const BLOCKED_PARAMETER_KEYS = new Set([
  "device_ip",
  "deviceip",
  "reported_ip",
  "reportedip",
  "group_owner_address",
  "groupowneraddress",
  "manifest_url",
  "manifesturl",
  "media_url",
  "mediaurl",
  "local_url",
  "localurl",
  "ssid",
  "password",
  "wifi_password",
  "wifipassword",
]);

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const IPV4_PATTERN = /(?:^|[^\d])(?:\d{1,3}\.){3}\d{1,3}(?:$|[^\d])/;
const LOCAL_HOST_PATTERN = /(?:^|[^A-Za-z0-9.-])(?:localhost|[A-Za-z0-9.-]+\.local)(?::\d+)?(?:$|[^A-Za-z0-9.-])/i;
const CLOCK_SKEW_MS = 30_000;
const MAX_COMMAND_TTL_MS = 5 * 60_000;

export const HEYCYAN_DEVICE_LANE = Object.freeze({
  policy_version: HEYCYAN_POLICY_VERSION,
  module: Object.freeze({
    name: "Jahorin Optics Bridge",
    id: "jahorin-optics-bridge",
    device_lane: "heycyan",
    market_category: SIAAS_MARKET_CATEGORY,
  }),
  classification: Object.freeze({
    device_type: "vendor_ble_wifi_smart_glasses",
    android_xr_device: false,
    android_xr_compatibility_claimed: false,
  }),
  android_companion: Object.freeze({
    compile_sdk: 36,
    target_sdk: 36,
    minimum_permissions: Object.freeze([
      "BLUETOOTH_SCAN",
      "BLUETOOTH_CONNECT",
      "NEARBY_WIFI_DEVICES",
      "RECORD_AUDIO_WHEN_SPEECH_IS_USED",
      "POST_NOTIFICATIONS_WHEN_FOREGROUND_TRANSFER_IS_USED",
      "MEDIASTORE_SCOPED_ACCESS",
    ]),
    excluded_permissions: Object.freeze(["QUERY_ALL_PACKAGES", "MANAGE_EXTERNAL_STORAGE"]),
    excluded_surfaces: Object.freeze([
      "accessibility_automation",
      "telegram_control",
      "shizuku",
      "remote_phone_control",
      "autonomous_screen_interaction",
    ]),
  }),
  cyanbridge_adoption: Object.freeze({
    use_entire_application: false,
    posture: "reference_only",
    extract_only: Object.freeze([
      "heycyan_ble_transport",
      "firmware_information_reader",
      "wifi_p2p_controller",
      "device_ip_notification_parser",
      "media_manifest_parser",
      "media_store_importer",
      "opus_container_repair",
    ]),
  }),
  transfer: Object.freeze({
    control_plane: "ble",
    data_plane: "wifi_p2p",
    enter_transfer_command_hex: "02 01 04",
    ip_notification_type: "0x08",
    ip_bytes: "7..10",
    error_notification_type: "0x09",
    error_255_automatically_fatal: false,
    prefer_ble_reported_ip: true,
    reject_group_owner_as_device_ip: true,
    bind_client_to_selected_p2p_network: true,
    manifest_path: "/files/media.config",
    media_base_path: "/files/",
    suppress_p2p_reset_during_http: true,
    verify_manifest_reachability_before_retry: true,
  }),
  transport_boundary: Object.freeze({
    cloud: Object.freeze(["https", "wss"]),
    local_cleartext_http: "android_companion_only",
    local_endpoint_source: "ble_notification_subtype_0x08",
    require_private_local_address: true,
    redirects_allowed: false,
    local_media_urls_may_cross_ari: false,
  }),
  firmware: Object.freeze({
    update_enabled: false,
    reason: "No verified vendor manifest, signature policy, rollback contract, or recovery procedure.",
    unknown_firmware: "basic_commands_only",
    verified_experimental_profiles: Object.freeze([]),
  }),
  permissions: Object.freeze({
    requested_by_adapter: true,
    ui_owns_prompt: true,
    device_command_before_grant: false,
    partial_grant_state: "permission_required",
    permanent_denial_state: "capability_unavailable",
    resume_pairing_after_grant: true,
    persist_permission_result_as_capability: true,
  }),
  execution: Object.freeze({
    authority: "ari_authenticated_policy_layer",
    companion_required: true,
    default_status: "awaiting_companion",
    idempotency_scope: "gid_device_operation_idempotency_key",
    companion_deduplicates_by: "command_id",
    autonomous_android_accessibility_execution: false,
  }),
  normalized_states: NORMALIZED_STATES,
  operations: OPERATION_REGISTRY,
});

function policyError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalOperation(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return OPERATION_ALIASES[raw] || String(value || "").trim().toLowerCase();
}

function assertNoLocalTransportData(value, path = "parameters", depth = 0) {
  if (depth > 8) throw policyError(422, "PARAMETERS_TOO_DEEP", "HeyCyan command parameters exceed the supported nesting depth");
  if (typeof value === "string") {
    if (/\bhttp:\/\//i.test(value) || IPV4_PATTERN.test(value) || LOCAL_HOST_PATTERN.test(value) || /\/files\//i.test(value)) {
      throw policyError(422, "LOCAL_TRANSPORT_DATA_FORBIDDEN", `Local glasses transport data cannot cross ARI (${path})`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoLocalTransportData(entry, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[\s-]+/g, "_");
    if (BLOCKED_PARAMETER_KEYS.has(normalizedKey)) {
      throw policyError(422, "LOCAL_TRANSPORT_DATA_FORBIDDEN", `Local glasses transport field cannot cross ARI (${path}.${key})`);
    }
    assertNoLocalTransportData(entry, `${path}.${key}`, depth + 1);
  }
}

function parseCommandTime(value, field) {
  if (!value) throw policyError(422, "COMMAND_TIME_REQUIRED", `${field} is required`);
  const milliseconds = Date.parse(String(value));
  if (!Number.isFinite(milliseconds)) throw policyError(422, "INVALID_COMMAND_TIME", `${field} must be an ISO-8601 timestamp`);
  return milliseconds;
}

export function isHeyCyanIntent(intent = "") {
  return /\b(?:hey\s*cyan|smart\s*glasses?|optics\s*bridge|glasses?)\b/i.test(String(intent || ""));
}

export function inferHeyCyanOperation(intent = "") {
  const text = String(intent || "").trim().toLowerCase();
  if (/firmware/.test(text) && /update|upgrade|flash|install/.test(text)) return "glasses.firmware.update";
  if (/firmware/.test(text)) return "glasses.firmware.inspect";
  if (/disconnect|unpair|power\s*down/.test(text)) return "glasses.disconnect";
  if (/\b(sync|transfer|download|import)\b/.test(text)) return "glasses.media.sync";
  if (/\b(speech|microphone|listen|transcri)/.test(text)) return /\b(stop|end|cancel)\b/.test(text) ? "glasses.speech.stop" : "glasses.speech.start";
  if (/\bvideo\b/.test(text)) return /\b(stop|end|cancel)\b/.test(text) ? "glasses.video.stop" : "glasses.video.start";
  if (/\b(ai\s*photo|ai_photo)\b/.test(text)) return "glasses.ai_photo.capture";
  if (/\b(photo|picture|snapshot|capture)\b/.test(text)) return "glasses.capture.photo";
  if (/\b(connect|pair|activate)\b/.test(text)) return "glasses.connect";
  return "glasses.state.inspect";
}

export function resolveHeyCyanOperation(body = {}) {
  const supplied = body.operation || body.action || body.intent || body?.payload?.operation || body?.payload?.action || "";
  const operation = canonicalOperation(supplied || inferHeyCyanOperation(body.prompt || body.command || ""));
  if (operation === "glasses.firmware.update") {
    throw policyError(409, "FIRMWARE_UPDATE_DISABLED", HEYCYAN_DEVICE_LANE.firmware.reason);
  }
  if (!OPERATION_REGISTRY[operation]) {
    throw policyError(422, "UNSUPPORTED_HEYCYAN_OPERATION", `Unsupported HeyCyan operation: ${operation || "empty"}`);
  }
  return operation;
}

export function normalizeHeyCyanCommand(body = {}, { requestId, idempotencyKey, gid, humanConfirmed = false, now = Date.now() } = {}) {
  if (!plainObject(body)) throw policyError(400, "INVALID_COMMAND", "HeyCyan command body must be a JSON object");
  const operation = resolveHeyCyanOperation(body);
  const policy = OPERATION_REGISTRY[operation];
  if (policy.mode === "experimental") {
    throw policyError(409, "EXPERIMENTAL_OPERATION_DISABLED", "Experimental HeyCyan operations require a verified firmware capability profile");
  }
  if (policy.confirmation_required && humanConfirmed !== true) {
    throw policyError(428, "HUMAN_CONFIRMATION_REQUIRED", "Explicit human confirmation is required before this device command can be accepted");
  }
  const deviceId = String(body.device_id || body.deviceId || "").trim();
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw policyError(422, "INVALID_DEVICE_ID", "device_id is required and must contain only safe identifier characters");
  }

  const issuedAtMs = parseCommandTime(body.issued_at, "issued_at");
  const expiresAtMs = parseCommandTime(body.expires_at, "expires_at");
  if (issuedAtMs > now + CLOCK_SKEW_MS) {
    throw policyError(422, "COMMAND_CLOCK_SKEW", "issued_at is more than 30 seconds in the future");
  }
  if (expiresAtMs < now - CLOCK_SKEW_MS) {
    throw policyError(410, "COMMAND_EXPIRED", "HeyCyan command has expired");
  }
  if (expiresAtMs <= issuedAtMs || expiresAtMs - issuedAtMs > MAX_COMMAND_TTL_MS) {
    throw policyError(422, "INVALID_COMMAND_WINDOW", "Command expiry must be after issue time and no more than five minutes later");
  }

  const resolvedIdempotencyKey = String(body.idempotency_key || idempotencyKey || "").trim();
  if (!READ_ONLY_OPERATIONS.has(operation) && !IDEMPOTENCY_KEY_PATTERN.test(resolvedIdempotencyKey)) {
    throw policyError(422, "IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required for HeyCyan mutations");
  }

  const parameters = body.parameters ?? body?.payload?.parameters ?? {};
  if (!plainObject(parameters)) throw policyError(422, "INVALID_PARAMETERS", "parameters must be a JSON object");
  assertNoLocalTransportData(parameters);

  const resolvedRequestId = String(body.request_id || requestId || crypto.randomUUID()).trim();
  if (!REQUEST_ID_PATTERN.test(resolvedRequestId)) {
    throw policyError(422, "INVALID_REQUEST_ID", "request_id must contain only safe identifier characters");
  }
  const idempotencyScope = [String(gid || "public"), deviceId, operation, resolvedIdempotencyKey || resolvedRequestId].join("\u0000");
  const commandId = `hcy_${crypto.createHash("sha256").update(idempotencyScope).digest("hex").slice(0, 32)}`;

  return Object.freeze({
    version: "1.0",
    command_id: commandId,
    request_id: resolvedRequestId,
    ...(resolvedIdempotencyKey ? { idempotency_key: resolvedIdempotencyKey } : {}),
    gid: gid ? String(gid) : null,
    device_id: deviceId,
    device_lane: "heycyan",
    operation,
    intent: operation,
    parameters,
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
    required_capabilities: policy.required_capabilities,
    confirmation_required: policy.confirmation_required,
    authorization: Object.freeze({
      authority: "ari_authenticated_policy_layer",
      human_confirmed: humanConfirmed === true,
    }),
    execution: "awaiting_companion",
    executed: false,
  });
}

export function publicHeyCyanPolicy() {
  return HEYCYAN_DEVICE_LANE;
}
