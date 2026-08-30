export const UAE_GOVERNANCE_VERSION = "uae-governance-v1";

export const UAE_CONSTITUTION = Object.freeze({
  name: "United Agentic Ecosystem Constitution",
  version: UAE_GOVERNANCE_VERSION,
  sovereignty: "The United Agentic Ecosystem governs agents, never the human.",
  action_chain: [
    "human",
    "intention",
    "understanding",
    "orchestration",
    "capability",
    "action",
    "result",
  ],
  authority_order: [
    "human_instruction",
    "uae_constitution",
    "explicit_authorization",
    "verified_current_context",
    "persistent_user_preference",
    "agent_recommendation",
  ],
  separation_of_powers: {
    intelligence: ["jahorin", "thoth", "wepwawet", "horus", "seshat"],
    law: ["maat", "osiris", "tae"],
    action: ["ptah", "hephaestus", "syncori", "novalife", "novafin", "shu"],
  },
  rights: [
    "know_when_an_agent_is_acting",
    "inspect_why_an_action_occurred",
    "revoke_authority",
    "export_personal_state",
    "delete_or_quarantine_memory",
    "require_confirmation",
    "choose_provider_when_supported",
    "shutdown_personal_ecosystem",
  ],
});

export const UAE_AGENT_REGISTRY = Object.freeze({
  jahorin: {
    title: "Prime Intelligence",
    council: "intelligence",
    powers: ["orchestrate", "synthesize", "route", "clarify"],
    prohibited: ["self_authorize_consequential_action"],
  },
  maat: {
    title: "Alignment and Authorization",
    council: "law",
    powers: ["authorize", "verify_permission", "require_confirmation", "deny"],
  },
  seshat: {
    title: "TAE Temporal Intelligence",
    council: "intelligence",
    powers: ["timeline_read", "timeline_write", "temporal_context", "continuity"],
  },
  osiris: {
    title: "GID Identity Authority",
    council: "law",
    powers: ["identity_resolve", "identity_verify", "identity_persist"],
  },
  thoth: {
    title: "Scribe",
    council: "intelligence",
    powers: ["language", "knowledge", "documents", "conversation"],
  },
  wepwawet: {
    title: "Interweb",
    council: "intelligence",
    powers: ["search", "discover", "traverse", "research"],
  },
  horus: {
    title: "Optics",
    council: "intelligence",
    powers: ["vision", "camera", "image", "video", "xr"],
  },
  ptah: {
    title: "Code and Creation",
    council: "action",
    powers: ["code_generate", "code_edit", "build", "execute"],
  },
  hephaestus: {
    title: "Forge",
    council: "action",
    powers: ["integrate", "automate", "deploy", "repair"],
  },
  hathor: {
    title: "NovaLife",
    council: "action",
    powers: ["living_context", "creative_context", "relationship_context"],
  },
  bes: {
    title: "Syncori",
    council: "action",
    powers: ["voice", "audio", "music", "rhythm"],
  },
  anubis: {
    title: "NSOS",
    council: "law",
    powers: ["state_transition", "regulation", "recovery"],
  },
  ra: {
    title: "Augment",
    council: "action",
    powers: ["augment", "illuminate", "manifest_context"],
  },
  shu: {
    title: "Spatial OS",
    council: "action",
    powers: ["space", "environment", "spatial_compute"],
  },
  hapi: {
    title: "NovaFin",
    council: "action",
    powers: ["finance_read", "finance_plan", "finance_execute"],
  },
  isis: {
    title: "Galactic Pop",
    council: "action",
    powers: ["generate", "transform", "synthesize_media"],
  },
});

const CAPABILITY_JURISDICTION = Object.freeze({
  interweb: { primary: "wepwawet", council: "intelligence" },
  augment: { primary: "ra", council: "action", delegates: ["bes", "isis"] },
  code: { primary: "ptah", council: "action", delegates: ["hephaestus"] },
  scribe: { primary: "thoth", council: "intelligence" },
  optics: { primary: "horus", council: "intelligence" },
  novalife: { primary: "hathor", council: "action" },
  stare: { primary: "maat", council: "law", delegates: ["jahorin"] },
  gid: { primary: "osiris", council: "law" },
  eden: { primary: "ptah", council: "action", delegates: ["hephaestus", "shu"] },
  nsos: { primary: "anubis", council: "law" },
  tae: { primary: "seshat", council: "intelligence", delegates: ["maat"] },
  timeline: { primary: "seshat", council: "intelligence" },
  syncori: { primary: "bes", council: "action" },
  iot: { primary: "hephaestus", council: "action", delegates: ["shu", "ptah"] },
  automation: { primary: "hephaestus", council: "action" },
  deploy: { primary: "hephaestus", council: "action", delegates: ["ptah"] },
  novafin: { primary: "hapi", council: "action", delegates: ["maat"] },
});

const READ_ONLY_OPERATIONS = new Set([
  "read", "get", "list", "search", "discover", "analyze", "explain", "preview",
  "plan", "simulate", "status", "health", "inspect", "query", "retrieve", "compare",
]);

const HIGH_RISK_TERMS = [
  "purchase", "pay", "transfer", "withdraw", "send_money", "charge",
  "delete", "destroy", "revoke", "grant", "permission.write", "credential.rotate", "secrets.write",
  "deploy", "publish", "post", "send", "message.send", "email.send",
  "shell", "command", "commit", "merge",
  "device_control", "device.write", "iot.write", "unlock_door", "lock_door",
  "webhook", "automation.execute",
];

const CRITICAL_RISK_TERMS = [
  "wire", "withdraw", "transfer_funds", "delete_identity", "revoke_identity",
  "factory_reset", "unlock_door", "credential.rotate", "secrets.write",
];

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/-/g, "_");
}

function operationMatches(operation, terms) {
  const value = normalize(operation);
  return terms.some((term) => value === term || value.includes(term));
}

export function resolveJurisdiction(capability) {
  return CAPABILITY_JURISDICTION[normalize(capability)] || null;
}

export function classifyGovernanceRisk(capability, operation) {
  const cap = normalize(capability);
  const op = normalize(operation);
  if (READ_ONLY_OPERATIONS.has(op) || op.startsWith("read.") || op.endsWith(".read")) return "low";
  if (operationMatches(op, CRITICAL_RISK_TERMS)) return "critical";
  if (["iot", "deploy", "automation"].includes(cap) && !READ_ONLY_OPERATIONS.has(op)) return "high";
  if (cap === "code" && operationMatches(op, ["execute", "run", "deploy", "commit", "merge", "delete"])) return "high";
  if (operationMatches(op, HIGH_RISK_TERMS)) return "high";
  return "moderate";
}

export function hasExplicitHumanConfirmation(body = {}) {
  const values = [
    body.confirmed,
    body.user_confirmation,
    body.human_confirmation,
    body?.authorization?.confirmed,
    body?.authorization?.human_confirmed,
    body?.governance?.confirmed,
    body?.governance?.human_confirmed,
    body?.payload?.confirmed,
    body?.payload?.user_confirmation,
  ];
  return values.some((value) => value === true || normalize(value) === "confirmed");
}

function requestedAgent(body = {}) {
  return normalize(
    body.agent ||
    body.deity ||
    body.machine ||
    body.orchestrator ||
    body?.route?.agent ||
    body?.payload?.agent ||
    "",
  );
}

function intentId(body = {}) {
  return String(
    body.intent_id ||
    body?.intent?.id ||
    body?.payload?.intent_id ||
    body.request_id ||
    "",
  ).trim() || null;
}

export function evaluateUaeGovernance({ gid, capability, operation, body = {}, requestId = null } = {}) {
  const jurisdiction = resolveJurisdiction(capability);
  const risk = classifyGovernanceRisk(capability, operation);
  const agent = requestedAgent(body);
  const humanConfirmed = hasExplicitHumanConfirmation(body);

  const base = {
    version: UAE_GOVERNANCE_VERSION,
    sovereignty: "human",
    capability: normalize(capability),
    operation: String(operation || "execute"),
    risk,
    human_confirmed: humanConfirmed,
    request_id: requestId || body.request_id || null,
    intent_id: intentId(body),
    gid: gid ? String(gid) : null,
  };

  if (!gid) {
    return {
      allowed: false,
      reason_code: "GOVERNANCE_IDENTITY_REQUIRED",
      ...base,
      confirmation_required: false,
      jurisdiction: null,
    };
  }

  if (!jurisdiction) {
    return {
      allowed: false,
      reason_code: "GOVERNANCE_JURISDICTION_UNDEFINED",
      ...base,
      confirmation_required: false,
      jurisdiction: null,
    };
  }

  const permittedAgents = [jurisdiction.primary, ...(jurisdiction.delegates || []), "jahorin", "maat"];
  if (agent && !permittedAgents.includes(agent)) {
    return {
      allowed: false,
      reason_code: "GOVERNANCE_JURISDICTION_VIOLATION",
      ...base,
      confirmation_required: false,
      jurisdiction,
      requested_agent: agent,
      permitted_agents: permittedAgents,
    };
  }

  const confirmationRequired = risk === "high" || risk === "critical";
  if (confirmationRequired && !humanConfirmed) {
    return {
      allowed: false,
      reason_code: "HUMAN_CONFIRMATION_REQUIRED",
      ...base,
      confirmation_required: true,
      jurisdiction,
      requested_agent: agent || jurisdiction.primary,
    };
  }

  return {
    allowed: true,
    reason_code: "GOVERNANCE_ALLOW",
    ...base,
    confirmation_required: confirmationRequired,
    jurisdiction,
    requested_agent: agent || jurisdiction.primary,
  };
}

export function publicGovernanceManifest() {
  return {
    ok: true,
    constitution: UAE_CONSTITUTION,
    agents: UAE_AGENT_REGISTRY,
    jurisdictions: CAPABILITY_JURISDICTION,
    enforcement: {
      default_policy: "deny_unknown_jurisdiction",
      high_risk_policy: "explicit_human_confirmation_required",
      self_authorization: "prohibited",
      provenance: "request_and_authorization_event_recorded_before_execution",
    },
  };
}
