import crypto from "node:crypto";

export const THOTH_VERIFIER_VERSION = "thoth-verifier-v1";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function hasEvidence(evidence, kind) {
  return evidence.some((item) => String(item?.kind || "") === kind);
}

function push(checks, id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail: String(detail || "") });
}

export function verifyN8nExecution({
  workflowId,
  policy,
  responseBody,
  approval = null,
  request = {},
} = {}) {
  const body = responseBody && typeof responseBody === "object" ? responseBody : {};
  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  const checks = [];

  push(checks, "workflow_match", body.workflow_id === workflowId || body.workflow_id == null, "response is bound to requested workflow");
  push(checks, "terminal_status", ["completed", "succeeded"].includes(String(body.status || "").toLowerCase()), "workflow reached a terminal successful state");
  push(checks, "result_present", body.result !== undefined && body.result !== null, "result payload exists");
  push(checks, "evidence_present", evidence.length > 0, "workflow emitted evidence");

  if (policy?.requires_human_approval) {
    const approved = approval && ["approved", "consumed"].includes(String(approval.status));
    push(checks, "human_approval", approved, "action-bound human approval exists");
  }

  switch (policy?.action_kind) {
    case "research":
      push(checks, "research_evidence", hasEvidence(evidence, "research_result") || Array.isArray(body?.result?.sources), "research has source/result evidence");
      break;
    case "document":
      push(checks, "document_evidence", hasEvidence(evidence, "document_result") || typeof body?.result?.content === "string", "document content or document evidence exists");
      break;
    case "private_code":
      push(checks, "private_code_evidence", hasEvidence(evidence, "code_artifact") || typeof body?.result?.code === "string", "private code artifact exists");
      push(checks, "no_deploy_claim", body?.result?.deployed !== true, "private-code workflow did not claim deployment");
      break;
    case "memory":
      push(checks, "memory_evidence", hasEvidence(evidence, "memory_write") || Array.isArray(body.memory_candidates), "memory workflow emitted a memory candidate or write evidence");
      break;
    case "email":
      push(checks, "email_evidence", hasEvidence(evidence, "email_sent") || Boolean(body?.result?.message_id), "email provider returned a message identifier");
      break;
    case "deployment":
      push(checks, "deployment_evidence", hasEvidence(evidence, "deployment") || Boolean(body?.result?.deployment_id || body?.result?.revision), "deployment returned provider evidence");
      break;
    case "money":
      push(checks, "money_evidence", hasEvidence(evidence, "transaction") || Boolean(body?.result?.transaction_id || body?.result?.provider_reference), "monetary action returned a provider reference");
      break;
    default:
      break;
  }

  const failed = checks.filter((check) => !check.ok);
  const verified = failed.length === 0;
  const attestation = {
    agent: "thoth",
    version: THOTH_VERIFIER_VERSION,
    workflow_id: workflowId,
    verified,
    verdict: verified ? "verified" : "rejected",
    checks,
    request_digest: digest(request),
    evidence_digest: digest(evidence),
    response_digest: digest(body),
    verified_at: new Date().toISOString(),
  };
  return { ...attestation, attestation_hash: digest(attestation) };
}
