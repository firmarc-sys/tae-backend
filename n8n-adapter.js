import crypto from "node:crypto";
import { n8nExecutionEnvelope, n8nWorkflowId, n8nWorkflowPolicy } from "./n8n-capability.js";
import { recallJahorinMemory, persistMemoryCandidates } from "./jahorin-memory.js";
import { verifyN8nExecution } from "./thoth-verifier.js";

const baseUrl = String(process.env.N8N_BASE_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.N8N_API_KEY || "");
const defaultTimeoutMs = Math.max(1000, Number(process.env.N8N_REQUEST_TIMEOUT_MS || 30000));

let runtimeDbFactory = null;

function configurationError(message) {
  return Object.assign(new Error(message), { status: 503, code: "N8N_NOT_CONFIGURED" });
}

function requireConfiguration() {
  if (!baseUrl) throw configurationError("N8N_BASE_URL is not configured");
  if (!apiKey) throw configurationError("N8N_API_KEY is not configured");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function actionHash({ gid, workflowId, input }) {
  return crypto.createHash("sha256").update(JSON.stringify(stable({
    gid: String(gid),
    workflow_id: workflowId,
    input,
  }))).digest("hex");
}

function redacted(value) {
  if (Array.isArray(value)) return value.map(redacted);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(password|secret|token|authorization|api[_-]?key|credential)/i.test(key)) out[key] = "[REDACTED]";
    else out[key] = redacted(item);
  }
  return out;
}


async function ensureAutonomyTask({ gid, taskId, sessionId, workflowId, idempotencyKey, input, policy }) {
  if (!runtimeDbFactory || !taskId) return;
  const intent = String(input?.intent || input?.prompt || input?.query || input?.goal || workflowId || "automation").trim().slice(0, 4000);
  await runtimeDbFactory().query(
    `insert into public.autonomy_tasks
      (task_id,gid,session_id,intent,mode,workflow_id,risk,status,plan,idempotency_key,updated_at)
     values ($1,$2,$3,$4,'guided',$5,$6,'running',$7::jsonb,$8,now())
     on conflict (task_id) do update
       set session_id=coalesce(excluded.session_id,public.autonomy_tasks.session_id),
           workflow_id=excluded.workflow_id,
           risk=excluded.risk,
           status='running',
           plan=public.autonomy_tasks.plan || excluded.plan,
           updated_at=now()`,
    [String(taskId), String(gid), sessionId ? String(sessionId) : null, intent || workflowId, workflowId, policy?.risk || "low", JSON.stringify({ agent: policy?.agent || "jahorin", action_kind: policy?.action_kind || null }), idempotencyKey],
  );
}

async function recordTaskPhase({ gid, taskId, agent = "jahorin", phase, eventType = "phase", payload = {}, status = null }) {
  if (!runtimeDbFactory || !taskId || !phase) return;
  const db = runtimeDbFactory();
  await db.query(
    `insert into public.autonomy_task_events (task_id,gid,event_type,agent,phase,payload)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [String(taskId), String(gid), eventType, agent, phase, JSON.stringify(redacted(payload || {}))],
  );
  if (status) {
    await db.query(
      `update public.autonomy_tasks
       set status=$2, updated_at=now(), completed_at=case when $2 in ('verified','failed','cancelled') then now() else completed_at end
       where task_id=$1`,
      [String(taskId), status],
    );
  }
}

async function beginInvocation({ gid, taskId, sessionId, workflowId, idempotencyKey, input, policy }) {
  if (!runtimeDbFactory) throw configurationError("Database context is required for durable n8n execution");
  const db = runtimeDbFactory();
  await ensureAutonomyTask({ gid, taskId, sessionId, workflowId, idempotencyKey, input, policy });
  await recordTaskPhase({ gid, taskId, agent: "jahorin", phase: "understanding", payload: { workflow_id: workflowId } });
  await recordTaskPhase({ gid, taskId, agent: policy?.agent || "jahorin", phase: "planning", payload: { risk: policy?.risk || "low" } });
  const existing = await db.query(
    `select invocation_id,status,response_payload,thoth_verification,approval_id,attempts
     from public.automation_invocations
     where gid=$1 and idempotency_key=$2
     limit 1`,
    [String(gid), idempotencyKey],
  );
  const row = existing.rows[0];
  if (row && row.status === "verified") {
    return {
      replay: true,
      invocation_id: row.invocation_id,
      response_payload: row.response_payload,
      thoth_verification: row.thoth_verification,
      approval_id: row.approval_id,
    };
  }
  if (row && row.status === "running") {
    throw Object.assign(new Error("An automation invocation with this idempotency key is already running"), {
      status: 409,
      code: "N8N_INVOCATION_IN_PROGRESS",
      invocation_id: row.invocation_id,
    });
  }
  if (row && policy?.requires_human_approval && !["verified", "approval_required"].includes(String(row.status))) {
    throw Object.assign(new Error("A prior high-risk invocation did not reach verified completion; reconcile its external side effect before retrying"), {
      status: 409,
      code: "N8N_HIGH_RISK_RETRY_REQUIRES_RECONCILIATION",
      invocation_id: row.invocation_id,
      prior_status: row.status,
    });
  }

  const invocationId = row?.invocation_id || crypto.randomUUID();
  await db.query(
    `insert into public.automation_invocations
      (invocation_id,gid,task_id,workflow_id,idempotency_key,status,request_payload,policy,attempts,started_at,updated_at)
     values ($1,$2,$3,$4,$5,'running',$6::jsonb,$7::jsonb,1,now(),now())
     on conflict (gid,idempotency_key) do update
       set status='running',
           task_id=excluded.task_id,
           workflow_id=excluded.workflow_id,
           request_payload=excluded.request_payload,
           policy=excluded.policy,
           attempts=public.automation_invocations.attempts+1,
           error_payload=null,
           started_at=now(),
           updated_at=now()`,
    [invocationId, String(gid), taskId, workflowId, idempotencyKey, JSON.stringify(redacted(input || {})), JSON.stringify(policy || {})],
  );
  return { replay: false, invocation_id: invocationId };
}

async function recordHumanApproval({ gid, taskId, workflowId, idempotencyKey, input, policy }) {
  if (!policy?.requires_human_approval) return null;
  const confirmed = input?.human_confirmation === true
    || input?.user_confirmation === true
    || input?.confirmed === true
    || input?.approval?.human_confirmed === true;
  if (!confirmed) {
    throw Object.assign(new Error(`Human confirmation is required before ${policy.action_kind} execution`), {
      status: 428,
      code: "HUMAN_CONFIRMATION_REQUIRED",
      action_kind: policy.action_kind,
    });
  }

  if (!runtimeDbFactory) throw configurationError("Database context is required for approval persistence");
  const hash = actionHash({ gid, workflowId, input: redacted(input) });
  const result = await runtimeDbFactory().query(
    `insert into public.autonomy_approvals
      (gid,task_id,workflow_id,action_kind,action_hash,status,request_payload,approved_by_gid,approved_at,idempotency_key,expires_at,updated_at)
     values ($1,$2,$3,$4,$5,'approved',$6::jsonb,$1,now(),$7,now()+interval '15 minutes',now())
     on conflict (gid,idempotency_key) do update
       set workflow_id=excluded.workflow_id,
           action_kind=excluded.action_kind,
           action_hash=excluded.action_hash,
           status='approved',
           request_payload=excluded.request_payload,
           approved_by_gid=excluded.approved_by_gid,
           approved_at=now(),
           expires_at=excluded.expires_at,
           updated_at=now()
     returning approval_id,status,action_kind,action_hash,approved_at,expires_at`,
    [String(gid), taskId, workflowId, policy.action_kind, hash, JSON.stringify(redacted(input || {})), idempotencyKey],
  );
  return result.rows[0] || null;
}

async function markApprovalConsumed(approvalId) {
  if (!approvalId || !runtimeDbFactory) return;
  await runtimeDbFactory().query(
    `update public.autonomy_approvals
     set status='consumed', consumed_at=now(), updated_at=now()
     where approval_id=$1 and status='approved'`,
    [approvalId],
  );
}

async function finishInvocation({ invocationId, status, responseBody = null, thoth = null, approvalId = null, error = null }) {
  if (!runtimeDbFactory || !invocationId) return;
  await runtimeDbFactory().query(
    `update public.automation_invocations
     set status=$2,
         response_payload=$3::jsonb,
         thoth_verification=$4::jsonb,
         approval_id=$5,
         error_payload=$6::jsonb,
         completed_at=case when $2 in ('verified','verification_failed','failed') then now() else completed_at end,
         updated_at=now()
     where invocation_id=$1`,
    [
      invocationId,
      status,
      JSON.stringify(responseBody),
      JSON.stringify(thoth),
      approvalId,
      JSON.stringify(error ? { code: error.code || null, message: error.message || String(error) } : null),
    ],
  );
}

export async function resolveRegisteredN8nWorkflow(db, workflowId) {
  const workflow = n8nWorkflowId({ workflow_id: workflowId });
  const policy = n8nWorkflowPolicy(workflow);
  if (!policy) {
    throw Object.assign(new Error("Requested n8n workflow is not part of the Jahorin workflow registry"), {
      status: 403,
      code: "N8N_WORKFLOW_POLICY_UNDEFINED",
    });
  }
  if (typeof db !== "function") throw configurationError("Capability registry database is unavailable");
  runtimeDbFactory = db;

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
  return { workflow_id: workflow, capability_id: capability.id, policy };
}

export async function executeN8nWorkflow({
  gid,
  requestId,
  taskId,
  sessionId,
  workflowId,
  idempotencyKey,
  input = {},
}) {
  requireConfiguration();
  const workflow = n8nWorkflowId({ workflow_id: workflowId });
  const policy = n8nWorkflowPolicy(workflow);
  if (!policy) throw Object.assign(new Error("n8n workflow policy is undefined"), { status: 403, code: "N8N_WORKFLOW_POLICY_UNDEFINED" });

  const idem = String(idempotencyKey || "").trim() || crypto.randomUUID();
  const invocation = await beginInvocation({ gid, taskId, sessionId, workflowId: workflow, idempotencyKey: idem, input, policy });
  if (invocation.replay) {
    return {
      status: "completed",
      verified: true,
      replayed: true,
      workflow_id: workflow,
      idempotency_key: idem,
      invocation_id: invocation.invocation_id,
      n8n: invocation.response_payload,
      thoth: invocation.thoth_verification,
      approval_id: invocation.approval_id,
    };
  }

  let approval = null;
  try {
    approval = await recordHumanApproval({ gid, taskId, workflowId: workflow, idempotencyKey: idem, input, policy });
    const query = String(input?.query || input?.prompt || input?.intent || input?.goal || "").trim();
    const memoryContext = await recallJahorinMemory(runtimeDbFactory, { gid, query, limit: 8 }).catch(() => []);
    const envelope = n8nExecutionEnvelope({
      gid,
      requestId,
      taskId,
      sessionId,
      workflowId: workflow,
      idempotencyKey: idem,
      input,
      approval,
      memoryContext,
    });

    await recordTaskPhase({ gid, taskId, agent: policy.agent, phase: "acting", payload: { workflow_id: workflow } });

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(policy.timeout_ms || defaultTimeoutMs));
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
        throw Object.assign(new Error(body?.message || body?.error || `n8n returned HTTP ${response.status}`), {
          status: response.status >= 500 ? 502 : response.status,
          code: "N8N_EXECUTION_FAILED",
          n8n_status: response.status,
        });
      }

      if (approval?.approval_id) await markApprovalConsumed(approval.approval_id);
      await recordTaskPhase({ gid, taskId, agent: policy.agent, phase: "observing", payload: { workflow_id: workflow } });
      await recordTaskPhase({ gid, taskId, agent: "thoth", phase: "verifying", payload: { workflow_id: workflow }, status: "verifying" });

      const thoth = verifyN8nExecution({
        workflowId: workflow,
        policy,
        responseBody: body,
        approval: approval ? { ...approval, status: "consumed" } : null,
        request: envelope,
      });

      if (!thoth.verified) {
        const error = Object.assign(new Error("Thoth rejected n8n completion because required evidence was missing or inconsistent"), {
          status: 502,
          code: "THOTH_VERIFICATION_FAILED",
          thoth,
        });
        await finishInvocation({
          invocationId: invocation.invocation_id,
          status: "verification_failed",
          responseBody: body,
          thoth,
          approvalId: approval?.approval_id || null,
          error,
        });
        await recordTaskPhase({ gid, taskId, agent: "thoth", phase: "failed", eventType: "verification_failed", payload: { checks: thoth.checks }, status: "failed" });
        throw error;
      }

      await persistMemoryCandidates(runtimeDbFactory, {
        gid,
        taskId,
        candidates: body?.memory_candidates,
      });

      await finishInvocation({
        invocationId: invocation.invocation_id,
        status: "verified",
        responseBody: body,
        thoth,
        approvalId: approval?.approval_id || null,
      });

      await recordTaskPhase({ gid, taskId, agent: "thoth", phase: "completed", eventType: "verified", payload: { attestation_hash: thoth.attestation_hash }, status: "verified" });

      if (runtimeDbFactory) {
        await runtimeDbFactory().query(
          `insert into public.thoth_verifications
            (gid,task_id,invocation_id,workflow_id,verdict,checks,attestation_hash,evidence)
           values ($1,$2,$3,$4,'verified',$5::jsonb,$6,$7::jsonb)`,
          [String(gid), taskId, invocation.invocation_id, workflow, JSON.stringify(thoth.checks), thoth.attestation_hash, JSON.stringify(body?.evidence || [])],
        );
      }

      return {
        status: "completed",
        verified: true,
        replayed: false,
        workflow_id: workflow,
        idempotency_key: idem,
        invocation_id: invocation.invocation_id,
        approval_id: approval?.approval_id || null,
        thoth,
        n8n: body,
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = Object.assign(new Error("n8n request timed out"), { status: 504, code: "N8N_TIMEOUT" });
        await finishInvocation({ invocationId: invocation.invocation_id, status: "failed", approvalId: approval?.approval_id || null, error: timeoutError });
        await recordTaskPhase({ gid, taskId, agent: policy.agent, phase: "failed", eventType: "timeout", payload: { code: timeoutError.code }, status: "failed" });
        throw timeoutError;
      }
      if (error?.code !== "THOTH_VERIFICATION_FAILED") {
        await finishInvocation({ invocationId: invocation.invocation_id, status: "failed", approvalId: approval?.approval_id || null, error });
        await recordTaskPhase({ gid, taskId, agent: policy.agent, phase: "failed", eventType: "execution_failed", payload: { code: error?.code || null, message: error?.message || String(error) }, status: "failed" }).catch(() => {});
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    if (error?.code === "HUMAN_CONFIRMATION_REQUIRED") {
      await finishInvocation({ invocationId: invocation.invocation_id, status: "approval_required", approvalId: null, error });
      await recordTaskPhase({ gid, taskId, agent: "maat", phase: "approval_required", eventType: "approval_required", payload: { action_kind: policy.action_kind }, status: "approval_required" }).catch(() => {});
    }
    throw error;
  }
}
