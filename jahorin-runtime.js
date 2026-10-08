import crypto from "node:crypto";
import { superAppManifest } from "./mxr-superapp-manifest.js";
import { integrationReadiness } from "./mxr-integration-fabric.js";
import {
  appendExecutionEvent,
  createExecution,
  executionStoreHealth,
  findIdempotentExecution,
  getExecution,
  listExecutionEvents,
  updateExecution,
} from "./jahorin-execution-store.js";

const TERMINAL_STATES = new Set(["completed", "verified", "failed", "cancelled", "rolled_back"]);

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

export function installJahorinRuntimeRoutes(api, {
  authorize,
  execute,
  responseBase,
}) {
  api.get("/runtime/manifest", (_req, res) => {
    return res.json(responseBase({
      super_app: superAppManifest(),
      integrations: integrationReadiness(),
      contract: {
        execution_create: "POST /api/runtime/executions",
        execution_read: "GET /api/runtime/executions/:id",
        execution_cancel: "POST /api/runtime/executions/:id/cancel",
        execution_events: "GET /api/runtime/executions/:id/events",
      },
    }));
  });

  api.get("/runtime/readiness", async (_req, res) => {
    const integrations = integrationReadiness();
    const neon = await executionStoreHealth();
    return res.status(neon ? 200 : 503).json(responseBase({
      ok: neon,
      runtimes: ["thoth", "jahorin", "trismegistus", "mercury"],
      persistence: { provider: "neon-postgres", ready: neon },
      integrations,
      degraded: [
        ...(!neon ? ["neon"] : []),
        ...Object.entries(integrations).filter(([, ready]) => !ready).map(([name]) => name),
      ],
    }));
  });

  api.post("/runtime/executions", async (req, res, next) => {
    try {
      const principal = await authorize(req);
      const gid = String(principal?.gid || "").trim();
      if (!gid) throw httpError(401, "Authenticated GID required", "AUTH_REQUIRED");

      const intent = String(req.body?.intent || req.body?.payload?.prompt || "").trim();
      if (!intent) throw httpError(422, "intent is required", "INTENT_REQUIRED");
      if (intent.length > 20000) throw httpError(413, "intent is too long", "INTENT_TOO_LONG");

      const capability = String(req.body?.capability || "tae").trim().toLowerCase();
      const key = idempotencyKey(req);
      const requestId = String(req.body?.request_id || req.requestId || crypto.randomUUID());

      const existing = await findIdempotentExecution(gid, key);
      if (existing) {
        return res.status(200).json(responseBase({
          gid,
          request_id: requestId,
          execution: existing,
          idempotent_replay: true,
        }));
      }

      const executionId = crypto.randomUUID();
      const execution = await createExecution({
        id: executionId,
        gid,
        capability,
        intent,
        payload: req.body?.payload || {},
        context: req.body?.context || {},
        requestId,
        idempotencyKey: key || null,
      });
      await appendExecutionEvent({
        gid,
        executionId,
        type: "execution.accepted",
        payload: { capability, intent },
        requestId,
      });

      void runExecution({ execute, req, gid, executionId, requestId, execution }).catch((error) => {
        console.error("Jahorin execution worker failed", error);
      });

      return res.status(202).json(responseBase({
        gid,
        request_id: requestId,
        execution,
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
      const execution = await getExecution(gid, req.params.id);
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
      const execution = await getExecution(gid, req.params.id);
      if (!execution) throw httpError(404, "Execution not found", "EXECUTION_NOT_FOUND");
      if (TERMINAL_STATES.has(execution.state)) return res.json(responseBase({ execution }));

      const updated = await updateExecution(gid, req.params.id, { state: "cancel_requested" });
      await appendExecutionEvent({
        gid,
        executionId: req.params.id,
        type: "execution.cancel_requested",
        payload: {},
        requestId: req.requestId,
      });
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
      const execution = await getExecution(gid, req.params.id);
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
        const rows = await listExecutionEvents({ gid, executionId: req.params.id, after: cursor, limit: 100 });
        for (const event of rows) {
          cursor = event.created_at;
          send(event);
        }
        const latest = await getExecution(gid, req.params.id);
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

async function runExecution({ execute, req, gid, executionId, requestId, execution }) {
  await updateExecution(gid, executionId, { state: "running", started_at: now() });
  await appendExecutionEvent({ gid, executionId, type: "execution.started", payload: {}, requestId });

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

    const current = await getExecution(gid, executionId);
    if (current?.state === "cancel_requested") {
      const cancelled = await updateExecution(gid, executionId, {
        state: "cancelled",
        result: { cancelled: true },
        completed_at: now(),
      });
      await appendExecutionEvent({ gid, executionId, type: "execution.cancelled", payload: { result: result || null }, requestId });
      return cancelled;
    }

    const completed = await updateExecution(gid, executionId, {
      state: "completed",
      result: result || {},
      completed_at: now(),
    });
    await appendExecutionEvent({ gid, executionId, type: "execution.completed", payload: result || {}, requestId });
    return completed;
  } catch (error) {
    const failure = { code: error?.code || "EXECUTION_FAILED", message: error?.message || "Execution failed" };
    const failed = await updateExecution(gid, executionId, {
      state: "failed",
      error: failure,
      completed_at: now(),
    });
    await appendExecutionEvent({ gid, executionId, type: "execution.failed", payload: failure, requestId });
    return failed;
  }
}
