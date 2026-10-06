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
  },
});

export function n8nWorkflowId(input) {
  const id = String(input?.workflow_id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw Object.assign(new Error("A registered n8n workflow_id is required"), {
      status: 400,
      code: "N8N_WORKFLOW_ID_INVALID",
    });
  }
  return id;
}

export function n8nExecutionEnvelope({ gid, requestId, taskId, sessionId, workflowId, idempotencyKey, input }) {
  return {
    tenant_id: String(gid),
    agent_id: "jahorin",
    session_id: sessionId ? String(sessionId) : null,
    task_id: taskId ? String(taskId) : null,
    workflow_id: workflowId,
    invocation_id: String(requestId),
    idempotency_key: String(idempotencyKey),
    schema_version: "1.0",
    input: input && typeof input === "object" ? input : {},
  };
}
