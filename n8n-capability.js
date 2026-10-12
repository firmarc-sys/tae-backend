export const N8N_WORKFLOW_REGISTRY = Object.freeze({
  "jahorin-realtime-v1": Object.freeze({
    id: "jahorin-realtime-v1",
    agent: "jahorin",
    purpose: "Realtime guided turn choreography and task handoff.",
    risk: "low",
    action_kind: "conversation",
    requires_human_approval: false,
    requires_thoth_verification: true,
    timeout_ms: 12000,
  }),
  "jahorin-research-v1": Object.freeze({
    id: "jahorin-research-v1",
    agent: "wepwawet",
    purpose: "Read-only research/recon execution.",
    risk: "low",
    action_kind: "research",
    requires_human_approval: false,
    requires_thoth_verification: true,
    timeout_ms: 30000,
  }),
  "jahorin-scribe-v1": Object.freeze({
    id: "jahorin-scribe-v1",
    agent: "thoth",
    purpose: "Document drafting, transformation, extraction, and lineage.",
    risk: "low",
    action_kind: "document",
    requires_human_approval: false,
    requires_thoth_verification: true,
    timeout_ms: 30000,
  }),
  "jahorin-code-private-v1": Object.freeze({
    id: "jahorin-code-private-v1",
    agent: "ta",
    purpose: "Generate or modify private code artifacts without deployment or external publication.",
    risk: "moderate",
    action_kind: "private_code",
    requires_human_approval: false,
    requires_thoth_verification: true,
    timeout_ms: 45000,
  }),
  "jahorin-memory-v1": Object.freeze({
    id: "jahorin-memory-v1",
    agent: "thoth",
    purpose: "Persist explicit user-authorized memory or task summaries.",
    risk: "low",
    action_kind: "memory",
    requires_human_approval: false,
    requires_thoth_verification: true,
    timeout_ms: 12000,
  }),
  "jahorin-email-v1": Object.freeze({
    id: "jahorin-email-v1",
    agent: "ta",
    purpose: "Send an external email after action-bound human confirmation.",
    risk: "high",
    action_kind: "email",
    requires_human_approval: true,
    requires_thoth_verification: true,
    timeout_ms: 30000,
  }),
  "jahorin-deploy-v1": Object.freeze({
    id: "jahorin-deploy-v1",
    agent: "ta",
    purpose: "Perform a deployment or release action after action-bound human confirmation.",
    risk: "high",
    action_kind: "deployment",
    requires_human_approval: true,
    requires_thoth_verification: true,
    timeout_ms: 60000,
  }),
  "jahorin-money-v1": Object.freeze({
    id: "jahorin-money-v1",
    agent: "ta",
    purpose: "Perform a monetary action after action-bound human confirmation.",
    risk: "critical",
    action_kind: "money",
    requires_human_approval: true,
    requires_thoth_verification: true,
    timeout_ms: 30000,
  }),
});

export const N8N_WORKFLOW_IDS = Object.freeze(Object.keys(N8N_WORKFLOW_REGISTRY));

export const N8N_CAPABILITY = Object.freeze({
  id: "automation.n8n",
  domain: "automation",
  description: "Execute an explicitly registered n8n workflow through the TAE control plane.",
  operations: ["execute", "status"],
  execution_methods: ["connector"],
  side_effect: true,
  bindings: {
    connector: "n8n",
    provider: "n8n",
  },
  manifestation: { form: "workspace", objects: ["progress", "confirm", "result"] },
  metadata: {
    provider: "n8n",
    governance: "uae-governance-v1",
    requires_registered_workflow: true,
    direct_frontend_access: false,
    workflow_registry_key: "workflow_ids",
    workflow_ids: N8N_WORKFLOW_IDS,
    workflow_policies: N8N_WORKFLOW_REGISTRY,
    completion_gate: "thoth",
    persistence_authority: "tae",
  },
});

export function n8nWorkflowId(input) {
  const id = String(input?.workflow_id || input || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw Object.assign(new Error("A registered n8n workflow_id is required"), {
      status: 400,
      code: "N8N_WORKFLOW_ID_INVALID",
    });
  }
  return id;
}

export function n8nWorkflowPolicy(workflowId) {
  const id = n8nWorkflowId(workflowId);
  return N8N_WORKFLOW_REGISTRY[id] || null;
}

export function n8nExecutionEnvelope({
  gid,
  requestId,
  taskId,
  sessionId,
  workflowId,
  idempotencyKey,
  input,
  approval = null,
  memoryContext = [],
}) {
  return {
    tenant_id: String(gid),
    agent_id: "jahorin",
    session_id: sessionId ? String(sessionId) : null,
    task_id: taskId ? String(taskId) : null,
    workflow_id: workflowId,
    invocation_id: String(requestId),
    idempotency_key: String(idempotencyKey),
    schema_version: "2.0",
    approval,
    memory_context: Array.isArray(memoryContext) ? memoryContext : [],
    input: input && typeof input === "object" ? input : {},
  };
}
