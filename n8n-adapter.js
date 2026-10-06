import crypto from "node:crypto";
import { n8nExecutionEnvelope, n8nWorkflowId } from "./n8n-capability.js";

const baseUrl = String(process.env.N8N_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.N8N_API_KEY || "");
const timeoutMs = Math.max(1000, Number(process.env.N8N_REQUEST_TIMEOUT_MS || 30000));

function configurationError(message) {
  return Object.assign(new Error(message), { status: 503, code: "N8N_NOT_CONFIGURED" });
}

function requireConfiguration() {
  if (!baseUrl) throw configurationError("N8N_BASE_URL is not configured");
  if (!apiKey) throw configurationError("N8N_API_KEY is not configured");
}

export async function resolveRegisteredN8nWorkflow(db, workflowId) {
  const workflow = n8nWorkflowId({ workflow_id: workflowId });
  const result = await db().query(
    `select id, metadata, enabled from public.capability_registry where id=$1 and enabled=true limit 1`,
    ["automation.n8n"],
  );
  const capability = result.rows[0];
  if (!capability) {
    throw Object.assign(new Error("automation.n8n capability is not registered"), {
      status: 503,
      code: "N8N_CAPABILITY_NOT_REGISTERED",
    });
  }
  const metadata = capability.metadata && typeof capability.metadata === "object" ? capability.metadata : {};
  const workflowIds = Array.isArray(metadata.workflow_ids)
    ? metadata.workflow_ids.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (!workflowIds.includes(workflow)) {
    throw Object.assign(new Error("Requested n8n workflow is not registered"), {
      status: 403,
      code: "N8N_WORKFLOW_NOT_REGISTERED",
    });
  }
  return { workflow_id: workflow, capability_id: capability.id };
}

export async function executeN8nWorkflow({ gid, requestId, taskId, sessionId, workflowId, idempotencyKey, input = {} }) {
  requireConfiguration();
  const workflow = n8nWorkflowId({ workflow_id: workflowId });
  const idem = String(idempotencyKey || "").trim() || crypto.randomUUID();
  const envelope = n8nExecutionEnvelope({
    gid,
    requestId,
    taskId,
    sessionId,
    workflowId: workflow,
    idempotencyKey: idem,
    input,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${baseUrl}/webhook/jahorin/${encodeURIComponent(workflow)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-jahorin-tenant": String(gid),
          "x-jahorin-request-id": String(requestId),
          "x-jahorin-idempotency-key": idem,
        },
        body: JSON.stringify(envelope),
        signal: controller.signal,
      },
    );
    const raw = await response.text();
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
    if (!response.ok) {
      throw Object.assign(new Error(body?.message || `n8n returned HTTP ${response.status}`), {
        status: response.status >= 500 ? 502 : response.status,
        code: "N8N_EXECUTION_FAILED",
        n8n_status: response.status,
      });
    }
    return {
      status: "completed",
      verified: Boolean(body?.verified === true || body?.execution?.verified === true),
      workflow_id: workflow,
      idempotency_key: idem,
      n8n: body,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(new Error("n8n request timed out"), { status: 504, code: "N8N_TIMEOUT" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
