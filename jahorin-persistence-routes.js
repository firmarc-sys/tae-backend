import crypto from "node:crypto";
import { listJahorinCapabilities } from "./jahorin-capability-catalog.js";

const q = (value) => encodeURIComponent(String(value));
const now = () => new Date().toISOString();
function httpError(status, message, code = "JAHORIN_PERSISTENCE_ERROR") {
  return Object.assign(new Error(message), { status, code });
}
function jsonObject(value, label = "value") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw httpError(422, `${label} must be a JSON object`, "VALIDATION_ERROR");
  return value;
}
async function audit(supabaseRequest, { gid, req, action, resourceType, resourceId, outcome, metadata = {} }) {
  try {
    await supabaseRequest("/rest/v1/jahorin_audit_events", { method: "POST", service: true, body: {
      gid, request_id: req.requestId || null, action, resource_type: resourceType,
      resource_id: resourceId || null, outcome, metadata,
    }});
  } catch (error) {
    // Audit failures are surfaced for mutations: silently dropping an audit event is unsafe.
    throw httpError(503, "Audit persistence unavailable; operation was not confirmed", "AUDIT_UNAVAILABLE");
  }
}

export function installJahorinPersistenceRoutes(api, { authorize, supabaseRequest, responseBase }) {
  async function principal(req) {
    const value = await authorize(req);
    const gid = String(value?.gid || "").trim();
    if (!gid) throw httpError(401, "Authenticated tenant identity required", "AUTH_REQUIRED");
    return { ...value, gid };
  }

  api.get("/jahorin/capabilities", async (req, res, next) => {
    try {
      await principal(req);
      return res.json(responseBase({ capabilities: listJahorinCapabilities() }));
    } catch (error) { next(error); }
  });

  api.get("/jahorin/artifacts", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const rows = await supabaseRequest(`/rest/v1/artifacts?gid=eq.${q(gid)}&select=artifact_id,objective_id,kind,title,content,metadata,created_at,updated_at&order=updated_at.desc&limit=${limit}`, { service: true });
      return res.json(responseBase({ gid, artifacts: Array.isArray(rows) ? rows : [] }));
    } catch (error) { next(error); }
  });

  api.post("/jahorin/artifacts", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const body = req.body || {};
      const kind = String(body.kind || "document").trim().slice(0, 80);
      const title = String(body.title || "Untitled artifact").trim().slice(0, 240);
      const content = String(body.content ?? "");
      if (!content && body.metadata == null) throw httpError(422, "content or metadata is required", "VALIDATION_ERROR");
      if (content.length > 1_000_000) throw httpError(413, "Artifact content exceeds 1 MB", "PAYLOAD_TOO_LARGE");
      const metadata = body.metadata == null ? {} : jsonObject(body.metadata, "metadata");
      const created = await supabaseRequest("/rest/v1/artifacts", { method: "POST", service: true, prefer: "return=representation", body: {
        gid, kind, title, content, metadata, objective_id: body.objective_id || null,
      }});
      const artifact = Array.isArray(created) ? created[0] : created;
      await audit(supabaseRequest, { gid, req, action: "artifact.create", resourceType: "artifact", resourceId: artifact?.artifact_id, outcome: "success", metadata: { kind } });
      return res.status(201).json(responseBase({ gid, artifact }));
    } catch (error) { next(error); }
  });

  api.get("/jahorin/artifacts/:id", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const rows = await supabaseRequest(`/rest/v1/artifacts?gid=eq.${q(gid)}&artifact_id=eq.${q(req.params.id)}&select=*&limit=1`, { service: true });
      if (!Array.isArray(rows) || !rows[0]) throw httpError(404, "Artifact not found", "NOT_FOUND");
      return res.json(responseBase({ gid, artifact: rows[0] }));
    } catch (error) { next(error); }
  });

  api.patch("/jahorin/artifacts/:id", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const body = req.body || {}, patch = { updated_at: now() };
      if (body.title !== undefined) patch.title = String(body.title).trim().slice(0, 240);
      if (body.content !== undefined) {
        patch.content = String(body.content);
        if (patch.content.length > 1_000_000) throw httpError(413, "Artifact content exceeds 1 MB", "PAYLOAD_TOO_LARGE");
      }
      if (body.metadata !== undefined) patch.metadata = jsonObject(body.metadata, "metadata");
      if (body.kind !== undefined) patch.kind = String(body.kind).trim().slice(0, 80);
      const rows = await supabaseRequest(`/rest/v1/artifacts?gid=eq.${q(gid)}&artifact_id=eq.${q(req.params.id)}`, { method: "PATCH", service: true, prefer: "return=representation", body: patch });
      const artifact = Array.isArray(rows) ? rows[0] : null;
      if (!artifact) throw httpError(404, "Artifact not found", "NOT_FOUND");
      await audit(supabaseRequest, { gid, req, action: "artifact.update", resourceType: "artifact", resourceId: req.params.id, outcome: "success" });
      return res.json(responseBase({ gid, artifact }));
    } catch (error) { next(error); }
  });

  api.delete("/jahorin/artifacts/:id", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const rows = await supabaseRequest(`/rest/v1/artifacts?gid=eq.${q(gid)}&artifact_id=eq.${q(req.params.id)}&select=artifact_id`, { service: true });
      if (!Array.isArray(rows) || !rows[0]) throw httpError(404, "Artifact not found", "NOT_FOUND");
      await supabaseRequest(`/rest/v1/artifacts?gid=eq.${q(gid)}&artifact_id=eq.${q(req.params.id)}`, { method: "DELETE", service: true });
      await audit(supabaseRequest, { gid, req, action: "artifact.delete", resourceType: "artifact", resourceId: req.params.id, outcome: "success" });
      return res.json(responseBase({ gid, deleted: true, artifact_id: req.params.id }));
    } catch (error) { next(error); }
  });

  api.get("/jahorin/memory", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const rows = await supabaseRequest(`/rest/v1/jahorin_memories?gid=eq.${q(gid)}&select=memory_id,memory_key,content,sensitivity,source,expires_at,created_at,updated_at&or=(expires_at.is.null,expires_at.gt.${q(now())})&order=updated_at.desc&limit=${limit}`, { service: true });
      return res.json(responseBase({ gid, memories: Array.isArray(rows) ? rows : [] }));
    } catch (error) { next(error); }
  });

  api.put("/jahorin/memory/:key", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const key = String(req.params.key || "").trim();
      if (!key || key.length > 160) throw httpError(422, "Memory key must be 1–160 characters", "VALIDATION_ERROR");
      const body = req.body || {}, content = body.content;
      if (content === undefined) throw httpError(422, "content is required", "VALIDATION_ERROR");
      if (JSON.stringify(content).length > 100_000) throw httpError(413, "Memory content exceeds 100 KB", "PAYLOAD_TOO_LARGE");
      const sensitivity = body.sensitivity === "sensitive" ? "sensitive" : "normal";
      const rows = await supabaseRequest("/rest/v1/jahorin_memories?on_conflict=gid,memory_key", { method: "POST", service: true, prefer: "resolution=merge-duplicates,return=representation", body: {
        gid, memory_key: key, content, sensitivity, source: body.source ? String(body.source).slice(0, 160) : null,
        expires_at: body.expires_at || null, updated_at: now(),
      }});
      const memory = Array.isArray(rows) ? rows[0] : null;
      await audit(supabaseRequest, { gid, req, action: "memory.upsert", resourceType: "memory", resourceId: key, outcome: "success", metadata: { sensitivity } });
      return res.json(responseBase({ gid, memory }));
    } catch (error) { next(error); }
  });

  api.delete("/jahorin/memory/:key", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const key = String(req.params.key || "").trim();
      await supabaseRequest(`/rest/v1/jahorin_memories?gid=eq.${q(gid)}&memory_key=eq.${q(key)}`, { method: "DELETE", service: true });
      await audit(supabaseRequest, { gid, req, action: "memory.forget", resourceType: "memory", resourceId: key, outcome: "success" });
      return res.json(responseBase({ gid, forgotten: true, memory_key: key }));
    } catch (error) { next(error); }
  });

  api.get("/jahorin/tasks", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const status = String(req.query.status || "").trim();
      const allowed = ["open","in_progress","blocked","completed","cancelled"];
      if (status && !allowed.includes(status)) throw httpError(422, "Invalid task status", "VALIDATION_ERROR");
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const filter = status ? `&status=eq.${q(status)}` : "";
      const rows = await supabaseRequest(`/rest/v1/jahorin_tasks?gid=eq.${q(gid)}${filter}&select=*&order=updated_at.desc&limit=${limit}`, { service: true });
      return res.json(responseBase({ gid, tasks: Array.isArray(rows) ? rows : [] }));
    } catch (error) { next(error); }
  });

  api.post("/jahorin/tasks", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const body = req.body || {}, title = String(body.title || "").trim();
      if (!title || title.length > 240) throw httpError(422, "title is required and must be <= 240 characters", "VALIDATION_ERROR");
      const status = body.status || "open";
      if (!["open","in_progress","blocked","completed","cancelled"].includes(status)) throw httpError(422, "Invalid task status", "VALIDATION_ERROR");
      const metadata = body.metadata == null ? {} : jsonObject(body.metadata, "metadata");
      const created = await supabaseRequest("/rest/v1/jahorin_tasks", { method: "POST", service: true, prefer: "return=representation", body: {
        gid, title, description: body.description == null ? null : String(body.description).slice(0, 10000),
        status, due_at: body.due_at || null, scheduled_at: body.scheduled_at || null, metadata,
        ...(status === "completed" ? { completed_at: now() } : {}),
      }});
      const task = Array.isArray(created) ? created[0] : created;
      await audit(supabaseRequest, { gid, req, action: "task.create", resourceType: "task", resourceId: task?.task_id, outcome: "success" });
      return res.status(201).json(responseBase({ gid, task }));
    } catch (error) { next(error); }
  });

  api.patch("/jahorin/tasks/:id", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const body = req.body || {}, patch = { updated_at: now() };
      if (body.title !== undefined) {
        patch.title = String(body.title).trim();
        if (!patch.title || patch.title.length > 240) throw httpError(422, "Invalid title", "VALIDATION_ERROR");
      }
      if (body.description !== undefined) patch.description = body.description == null ? null : String(body.description).slice(0, 10000);
      if (body.status !== undefined) {
        if (!["open","in_progress","blocked","completed","cancelled"].includes(body.status)) throw httpError(422, "Invalid task status", "VALIDATION_ERROR");
        patch.status = body.status;
        patch.completed_at = body.status === "completed" ? now() : null;
      }
      if (body.due_at !== undefined) patch.due_at = body.due_at;
      if (body.scheduled_at !== undefined) patch.scheduled_at = body.scheduled_at;
      if (body.metadata !== undefined) patch.metadata = jsonObject(body.metadata, "metadata");
      const rows = await supabaseRequest(`/rest/v1/jahorin_tasks?gid=eq.${q(gid)}&task_id=eq.${q(req.params.id)}`, { method: "PATCH", service: true, prefer: "return=representation", body: patch });
      const task = Array.isArray(rows) ? rows[0] : null;
      if (!task) throw httpError(404, "Task not found", "NOT_FOUND");
      await audit(supabaseRequest, { gid, req, action: "task.update", resourceType: "task", resourceId: req.params.id, outcome: "success" });
      return res.json(responseBase({ gid, task }));
    } catch (error) { next(error); }
  });

  api.delete("/jahorin/tasks/:id", async (req, res, next) => {
    try {
      const { gid } = await principal(req);
      const rows = await supabaseRequest(`/rest/v1/jahorin_tasks?gid=eq.${q(gid)}&task_id=eq.${q(req.params.id)}&select=task_id`, { service: true });
      if (!Array.isArray(rows) || !rows[0]) throw httpError(404, "Task not found", "NOT_FOUND");
      await supabaseRequest(`/rest/v1/jahorin_tasks?gid=eq.${q(gid)}&task_id=eq.${q(req.params.id)}`, { method: "DELETE", service: true });
      await audit(supabaseRequest, { gid, req, action: "task.delete", resourceType: "task", resourceId: req.params.id, outcome: "success" });
      return res.json(responseBase({ gid, deleted: true, task_id: req.params.id }));
    } catch (error) { next(error); }
  });
}
