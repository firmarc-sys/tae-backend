import crypto from "node:crypto";

const EXECUTION_STATES = new Set(["accepted","running","completed","failed","cancel_requested","cancelled"]);
const TERMINAL_STATES = new Set(["completed","failed","cancelled"]);

function httpError(status, message, code = "RUNTIME_ERROR") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function now() {
  return new Date().toISOString();
}

function idempotencyKey(req) {
  return String(req.get("idempotency-key") || req.body?.idempotency_key || "").trim().slice(0, 255);
}

async function writeEvent({ supabaseRequest, gid, executionId, type, payload = {}, requestId }) {
  return supabaseRequest("/rest/v1/jahorin_execution_events", {
    method: "POST",
    service: true,
    prefer: "return=representation",
    body: {
      execution_id: executionId,
      gid,
      event_type: type,
      payload,
      request_id: requestId || null,
    },
  });
}

async function loadExecution({ supabaseRequest, gid, executionId }) {
  const rows = await supabaseRequest(
    `/rest/v1/jahorin_executions?id=eq.${encodeURIComponent(executionId)}&gid=eq.${encodeURIComponent(gid)}&select=*&limit=1`,
    { service: true },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function setExecution({ supabaseRequest, gid, executionId, patch }) {
  const rows = await supabaseRequest(
    `/rest/v1/jahorin_executions?id=eq.${encodeURIComponent(executionId)}&gid=eq.${encodeURIComponent(gid)}`,
    {
      method: "PATCH",
      service: true,
      prefer: "return=representation",
      body: { ...patch, updated_at: now() },
    },
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function findIdempotent({ supabaseRequest, gid, key }) {
  if (!key) return null;
  const rows = await supabaseRequest(
    `/rest/v1/jahorin_executions?gid=eq.${encodeURIComponent(gid)}&idempotency_key=eq.${encodeURIComponent(key)}&select=*&limit=1`,
    { service: true },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function installJahorinRuntimeRoutes(api, {
  authorize,
  supabaseRequest,
  execute,
  responseBase,
}) {
  api.get("/runtime/executions", async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");

      const requestedLimit = Number.parseInt(String(req.query?.limit || "25"), 10);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
      const requestedState = String(req.query?.state || "").trim();
      if (requestedState && !EXECUTION_STATES.has(requestedState)) {
        throw httpError(400, "Unsupported execution state", "INVALID_EXECUTION_STATE");
      }

      const stateFilter = requestedState ? `&state=eq.${encodeURIComponent(requestedState)}` : "";
      const rows = await supabaseRequest(
        `/rest/v1/jahorin_executions?gid=eq.${encodeURIComponent(gid)}&select=id,gid,capability,intent,state,result,error,request_id,created_at,updated_at,started_at,completed_at&order=created_at.desc&limit=${limit}${stateFilter}`,
        { service: true },
      );
      return res.json(responseBase({
        gid,
        executions: Array.isArray(rows) ? rows : [],
        pagination: { limit, state: requestedState || null },
      }));
    } catch (error) {
      next(error);
    }
  });

  api.post("/runtime/executions", async (req, res, next) => {
    let principal;
    try {
      principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");

      const intent = String(req.body?.intent || req.body?.payload?.prompt || "").trim();
      if (!intent) throw httpError(422, "intent is required", "INTENT_REQUIRED");
      if (intent.length > 20000) throw httpError(413, "intent is too long", "INTENT_TOO_LONG");

      const capability = String(req.body?.capability || "tae").trim().toLowerCase();
      const key = idempotencyKey(req);
      const requestId = String(req.body?.request_id || req.requestId || crypto.randomUUID());

      const existing = await findIdempotent({ supabaseRequest, gid, key });
      if (existing) return res.status(200).json(responseBase({ gid, request_id: requestId, execution: existing, idempotent_replay: true }));

      const executionId = crypto.randomUUID();
      const created = await supabaseRequest("/rest/v1/jahorin_executions", {
        method: "POST",
        service: true,
        prefer: "return=representation",
        body: {
          id: executionId,
          gid,
          capability,
          intent,
          payload: req.body?.payload || {},
          context: req.body?.context || {},
          request_id: requestId,
          idempotency_key: key || null,
          state: "accepted",
          created_at: now(),
          updated_at: now(),
        },
      });
      const execution = Array.isArray(created) ? created[0] : created;
      await writeEvent({ supabaseRequest, gid, executionId, type: "execution.accepted", payload: { capability, intent }, requestId });

      // Fire-and-track: the HTTP request only acknowledges durable acceptance.
      void runExecution({ supabaseRequest, execute, req, gid, executionId, requestId, execution }).catch((error) => {
        console.error("Jahorin execution worker failed", error);
      });

      return res.status(202).json(responseBase({
        gid,
        request_id: requestId,
        execution: { ...execution, state: "accepted" },
      }));
    } catch (error) {
      next(error);
    }
  });

  api.get("/runtime/executions/:id", async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");
      const execution = await loadExecution({ supabaseRequest, gid, executionId: req.params.id });
      if (!execution) throw httpError(404, "Execution not found", "EXECUTION_NOT_FOUND");
      return res.json(responseBase({ gid, execution }));
    } catch (error) {
      next(error);
    }
  });

  api.post("/runtime/executions/:id/cancel", async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");
      const execution = await loadExecution({ supabaseRequest, gid, executionId: req.params.id });
      if (!execution) throw httpError(404, "Execution not found", "EXECUTION_NOT_FOUND");
      if (TERMINAL_STATES.has(execution.state)) return res.json(responseBase({ execution }));

      const updated = await setExecution({
        supabaseRequest,
        gid,
        executionId: req.params.id,
        patch: { state: "cancel_requested" },
      });
      await writeEvent({ supabaseRequest, gid, executionId: req.params.id, type: "execution.cancel_requested", payload: {}, requestId: req.requestId });
      return res.json(responseBase({ gid, execution: updated }));
    } catch (error) {
      next(error);
    }
  });

  api.get("/runtime/executions/:id/events", async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");
      const execution = await loadExecution({ supabaseRequest, gid, executionId: req.params.id });
      if (!execution) throw httpError(404, "Execution not found", "EXECUTION_NOT_FOUND");

      res.status(200);
      res.set({
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.flushHeaders?.();

      let cursor = new Date(0).toISOString();
      let closed = false;
      const send = (event) => {
        res.write(`id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const poll = async () => {
        if (closed) return;
        const rows = await supabaseRequest(
          `/rest/v1/jahorin_execution_events?execution_id=eq.${encodeURIComponent(req.params.id)}&gid=eq.${encodeURIComponent(gid)}&created_at=gt.${encodeURIComponent(cursor)}&select=*&order=created_at.asc&limit=100`,
          { service: true },
        );
        for (const event of Array.isArray(rows) ? rows : []) {
          cursor = event.created_at;
          send(event);
        }
        const latest = await loadExecution({ supabaseRequest, gid, executionId: req.params.id });
        if (latest && TERMINAL_STATES.has(latest.state)) {
          closed = true;
          clearInterval(timer);
          res.end();
        }
      };
      const timer = setInterval(() => void poll().catch(() => {}), 1000);
      req.on("close", () => {
        closed = true;
        clearInterval(timer);
      });
      await poll();
    } catch (error) {
      if (!res.headersSent) next(error);
      else res.end();
    }
  });
}

async function runExecution({ supabaseRequest, execute, req, gid, executionId, requestId, execution }) {
  const started = await setExecution({
    supabaseRequest, gid, executionId,
    patch: { state: "running", started_at: now() },
  });
  await writeEvent({ supabaseRequest, gid, executionId, type: "execution.started", payload: {}, requestId });

  try {
    const result = await execute({
      req,
      gid,
      executionId,
      requestId,
      capability: execution.capability,
      intent: execution.intent,
      payload: execution.payload || {},
      context: execution.context || {},
    });

    const current = await loadExecution({ supabaseRequest, gid, executionId });
    if (current?.state === "cancel_requested") {
      const cancelled = await setExecution({
        supabaseRequest, gid, executionId,
        patch: { state: "cancelled", result: { cancelled: true }, completed_at: now() },
      });
      await writeEvent({ supabaseRequest, gid, executionId, type: "execution.cancelled", payload: { result: result || null }, requestId });
      return cancelled;
    }

    const completed = await setExecution({
      supabaseRequest, gid, executionId,
      patch: { state: "completed", result: result || {}, completed_at: now() },
    });
    await writeEvent({ supabaseRequest, gid, executionId, type: "execution.completed", payload: result || {}, requestId });
    return completed;
  } catch (error) {
    const failed = await setExecution({
      supabaseRequest, gid, executionId,
      patch: {
        state: "failed",
        error: { code: error?.code || "EXECUTION_FAILED", message: error?.message || "Execution failed" },
        completed_at: now(),
      },
    });
    await writeEvent({ supabaseRequest, gid, executionId, type: "execution.failed", payload: failed?.error || {}, requestId });
    return failed;
  }
}
