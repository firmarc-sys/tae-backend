/**
 * Canonical capability contract for Jahorin -> TAE.
 *
 * "available" means the current backend has a concrete adapter. "adapter_required"
 * means the contract is defined but must remain unavailable until an authenticated,
 * tenant-scoped implementation is installed. Catalog entries never imply that an
 * external side effect happened.
 */
export const JAHORIN_CAPABILITY_CATALOG = Object.freeze({
  "system.orchestrate": { label: "Jahorin Core", deity: "Jahorin", adapter: "legacyOrchestrate", status: "available", operations: ["invoke", "plan", "status"], sideEffects: "none" },
  "web.research": { label: "Interweb", deity: "Wepwawet", adapter: "vertex-grounded-text", status: "available", operations: ["research", "search", "summarize", "compare"], sideEffects: "external-read" },
  "software.code": { label: "Intent to Code", deity: "Ptah", adapter: "vertex-code-generation", status: "available", operations: ["generate", "explain", "inspect", "refactor", "debug"], sideEffects: "none" },
  "documents.scribe": { label: "Scribe", deity: "Thoth", adapter: "vertex-document-generation", status: "available", operations: ["draft", "summarize", "rewrite", "extract", "translate", "ocr"], sideEffects: "none" },
  "media.image": { label: "Augmented Optics", deity: "Horus", adapter: "vertex-image-generation", status: "available", operations: ["generate", "edit", "analyze"], sideEffects: "none" },
  "media.audio": { label: "Augmented Audio", deity: "Hathor", adapter: "vertex-audio-generation", status: "available", operations: ["generate", "music", "sound-design"], sideEffects: "none" },
  "media.video": { label: "Video Studio", deity: "Horus", adapter: "vertex-video-generation", status: "available", operations: ["generate", "storyboard"], sideEffects: "none" },
  "files.manage": { label: "Files and Artifacts", deity: "Thoth", adapter: "tenant-file-store", status: "adapter_required", operations: ["create", "read", "update", "list", "delete", "version", "export"], sideEffects: "persistent-write" },
  "documents.ingest": { label: "Document Intelligence", deity: "Thoth", adapter: "document-ingestion", status: "adapter_required", operations: ["ocr", "parse", "classify", "extract", "translate", "redact"], sideEffects: "persistent-write" },
  "compute.code": { label: "Code Execution", deity: "Ptah", adapter: "isolated-code-sandbox", status: "adapter_required", operations: ["run", "test", "build", "lint", "package"], sideEffects: "isolated-compute" },
  "compute.shell": { label: "Command Terminal", deity: "Ptah", adapter: "isolated-command-sandbox", status: "adapter_required", operations: ["execute", "stream", "inspect"], sideEffects: "isolated-compute" },
  "browser.session": { label: "Browser Automation", deity: "Wepwawet", adapter: "isolated-browser", status: "adapter_required", operations: ["open", "navigate", "click", "fill", "snapshot", "download"], sideEffects: "external-read" },
  "memory.profile": { label: "Persistent Memory", deity: "Jahorin", adapter: "tenant-memory-store", status: "adapter_required", operations: ["remember", "recall", "update", "forget", "export"], sideEffects: "persistent-write" },
  "knowledge.search": { label: "Knowledge Base", deity: "Thoth", adapter: "tenant-retrieval-index", status: "adapter_required", operations: ["index", "search", "retrieve", "cite", "rebuild"], sideEffects: "persistent-write" },
  "workflow.orchestrate": { label: "Workflow Automation", deity: "Jahorin", adapter: "durable-workflow-engine", status: "adapter_required", operations: ["create", "run", "pause", "resume", "cancel", "retry", "schedule"], sideEffects: "external-write" },
  "communications.email": { label: "Email", deity: "Thoth", adapter: "email-provider", status: "adapter_required", operations: ["draft", "list", "read", "send", "reply", "label"], sideEffects: "external-write" },
  "communications.calendar": { label: "Calendar", deity: "Thoth", adapter: "calendar-provider", status: "adapter_required", operations: ["list", "create", "update", "delete", "invite", "availability"], sideEffects: "external-write" },
  "connectors.oauth": { label: "Connected Apps", deity: "Jahorin", adapter: "oauth-connector-registry", status: "adapter_required", operations: ["connect", "disconnect", "list", "refresh", "revoke"], sideEffects: "external-write" },
  "device.camera": { label: "Camera and Capture", deity: "Horus", adapter: "browser-device-permission", status: "adapter_required", operations: ["request_permission", "capture_photo", "capture_video", "enumerate"], sideEffects: "device-access" },
  "device.audio": { label: "Microphone and Audio", deity: "Hathor", adapter: "browser-device-permission", status: "adapter_required", operations: ["request_permission", "record", "transcribe", "playback", "analyze"], sideEffects: "device-access" },
  "device.control": { label: "Device Control", deity: "Horus", adapter: "authorized-device-connector", status: "adapter_required", operations: ["discover", "read_state", "control", "automate"], sideEffects: "external-write" },
  "data.pipeline": { label: "Data and Analytics", deity: "Thoth", adapter: "tenant-data-pipeline", status: "adapter_required", operations: ["import", "transform", "query", "analyze", "export", "visualize"], sideEffects: "persistent-write" },
  "cloud.deploy": { label: "Cloud and Deployment", deity: "Ptah", adapter: "scoped-cloud-deployer", status: "adapter_required", operations: ["plan", "validate", "deploy", "rollback", "logs", "health"], sideEffects: "high-impact-write" },
  "identity.access": { label: "Identity and Access", deity: "Ma'at", adapter: "tenant-identity-policy", status: "adapter_required", operations: ["whoami", "roles", "permissions", "grant", "revoke", "audit"], sideEffects: "security-write" },
  "billing.credits": { label: "Retrograde Credits and Billing", deity: "Jahorin", adapter: "billing-entitlement-service", status: "adapter_required", operations: ["balance", "quote", "usage", "ledger", "subscription"], sideEffects: "financial-write" },
  "scheduling.tasks": { label: "Tasks and Scheduling", deity: "Jahorin", adapter: "durable-task-queue", status: "adapter_required", operations: ["create", "list", "update", "complete", "schedule", "cancel"], sideEffects: "persistent-write" },
  "media.transcription": { label: "Speech and Transcription", deity: "Hathor", adapter: "speech-to-text", status: "adapter_required", operations: ["transcribe", "diarize", "caption", "translate", "summarize"], sideEffects: "none" },
  "media.live": { label: "Realtime Voice and Multimodal", deity: "Jahorin", adapter: "realtime-session-service", status: "adapter_required", operations: ["start_session", "stream_audio", "stream_video", "interrupt", "end_session"], sideEffects: "device-access" },
  "governance.audit": { label: "Ma'at Governance", deity: "Ma'at", adapter: "policy-and-audit-engine", status: "adapter_required", operations: ["authorize", "policy_check", "approval", "audit", "explain_decision"], sideEffects: "security-write" },
  "integrations.webhook": { label: "Webhooks and Events", deity: "Jahorin", adapter: "signed-event-gateway", status: "adapter_required", operations: ["register", "emit", "verify", "retry", "inspect"], sideEffects: "external-write" },
});

export function getJahorinCapability(id) {
  return JAHORIN_CAPABILITY_CATALOG[String(id || "").trim().toLowerCase()] || null;
}

export function listJahorinCapabilities({ status } = {}) {
  return Object.entries(JAHORIN_CAPABILITY_CATALOG)
    .filter(([, item]) => !status || item.status === status)
    .map(([id, item]) => ({ id, ...item }));
}
