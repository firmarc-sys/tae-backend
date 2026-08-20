import crypto from "node:crypto";
import fs from "node:fs/promises";

const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const SESSION_COOKIE = "ari_session";
const ENVIRONMENT_ENABLED = !/^(0|false|no|off)$/i.test(process.env.ARI_AUTONOMY_ENABLED || "true");
const DEFAULT_MAX_STEPS = Math.max(1, Math.min(32, Number(process.env.ARI_AUTONOMY_MAX_STEPS || 8)));
const DEFAULT_MAX_RETRIES = Math.max(0, Math.min(5, Number(process.env.ARI_AUTONOMY_MAX_RETRIES || 2)));
const SNAPSHOT_PATH = process.env.ARI_AUTONOMY_SNAPSHOT_PATH || "/tmp/ari-autonomy-state.json";

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tasksProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";
const tasksLocation = process.env.ARI_TASKS_LOCATION || process.env.GOOGLE_CLOUD_REGION || "us-west1";
const tasksQueue = process.env.ARI_TASKS_QUEUE || "";
const tasksServiceAccount = process.env.ARI_TASKS_SERVICE_ACCOUNT || "";
const publicUrl = String(process.env.ARI_PUBLIC_URL || "").replace(/\/$/, "");
const workerToken = process.env.ARI_WORKER_TOKEN || "";

const TOOL_REGISTRY = Object.freeze({
  ari_health: { risk: "low", auto: true, executable: true },
  mercury_health: { risk: "low", auto: true, executable: true },
  reasoning: { risk: "low", auto: true, executable: true },
  create_private_artifact: { risk: "low", auto: true, executable: true },
  deploy_production: { risk: "high", auto: false, executable: false, approval: true },
  merge_main: { risk: "high", auto: false, executable: false, approval: true },
  send_external_message: { risk: "high", auto: false, executable: false, approval: true },
  spend_money: { risk: "critical", auto: false, executable: false, approval: true },
  delete_data: { risk: "critical", auto: false, executable: false, approval: true },
  change_iam: { risk: "critical", auto: false, executable: false, approval: true },
  unrestricted_shell: { risk: "critical", auto: false, executable: false, approval: true },
});

function now() {
  return new Date().toISOString();
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [decodeURIComponent(part), ""]
          : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ownerSessionGid(req) {
  const secret = process.env.ARI_SESSION_SECRET || "";
  if (!secret) return null;
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = String(token).split(".", 3);
  const expires = Number(expiresRaw);
  if (!gid || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function sendJson(res, status, body, requestId) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    ...(requestId ? { "x-request-id": requestId } : {}),
  });
  res.end(data);
}

function parseBody(raw) {
  if (!raw?.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function normalizePath(pathname) {
  if (pathname === "/api") return "/";
  return pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
}

function publicRecord(record) {
  if (!record) return null;
  return JSON.parse(JSON.stringify(record));
}

function buildPlan(goal) {
  const intent = String(goal.intent || "").toLowerCase();
  const steps = [];
  const operational = /(production|operational|uptime|health|service|cloud run|ari|mercury|deployment|runtime)/i.test(intent);
  const code = /(code|build|software|repository|repo|github|bug|fix|implement)/i.test(intent);
  const research = /(research|search|investigate|compare|find|look up|web|internet)/i.test(intent);

  if (operational) {
    steps.push({ tool: "ari_health", title: "Inspect ARI health" });
    steps.push({ tool: "mercury_health", title: "Inspect Mercury readiness" });
  }

  steps.push({
    tool: "reasoning",
    title: operational ? "Diagnose and recommend next action" : research ? "Research and synthesize" : code ? "Analyze implementation path" : "Reason about the goal",
    capability: research ? "interweb" : code ? "code" : "reasoning",
  });
  steps.push({ tool: "create_private_artifact", title: "Persist private result" });

  return steps.slice(0, Math.max(1, Number(goal.max_steps || DEFAULT_MAX_STEPS)));
}

function classifyPolicy(step, mode) {
  const rule = TOOL_REGISTRY[step.tool];
  if (!rule) return { allowed: false, requiresApproval: true, reason: "tool_not_registered" };
  if (mode === "manual") return { allowed: true, requiresApproval: true, rule };
  if (!rule.auto || rule.approval) return { allowed: true, requiresApproval: true, rule };
  return { allowed: true, requiresApproval: false, rule };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function metadataAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`metadata token HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("metadata token missing access_token");
  return payload.access_token;
}

function createState() {
  return {
    hydrated: false,
    hydrationPromise: null,
    storage: "memory",
    storage_error: null,
    last_storage_attempt: 0,
    settings: { enabled: true, updated_at: now() },
    goals: new Map(),
    tasks: new Map(),
    events: new Map(),
    approvals: new Map(),
    artifacts: new Map(),
  };
}

export function createAutonomyRuntime({ innerPort }) {
  const innerBase = `http://127.0.0.1:${Number(innerPort)}`;
  const state = createState();

  function effectiveEnabled() {
    return ENVIRONMENT_ENABLED && state.settings.enabled !== false;
  }

  function requireOwner(req) {
    if (ownerSessionGid(req) !== OWNER_GID) {
      const error = new Error("Prime Orchestrator ARI session required");
      error.status = 401;
      throw error;
    }
  }

  function requireWorker(req) {
    if (!workerToken) {
      const error = new Error("ARI worker token is not configured");
      error.status = 503;
      throw error;
    }
    if (!timingSafeEqualText(req.headers["x-ari-worker-token"] || "", workerToken)) {
      const error = new Error("Invalid ARI worker token");
      error.status = 401;
      throw error;
    }
  }

  async function supabaseRequest(path, { method = "GET", body, prefer } = {}) {
    if (!supabaseUrl || !supabaseServerKey) throw new Error("Supabase autonomy persistence is not configured");
    const headers = { apikey: supabaseServerKey, accept: "application/json" };
    if (!supabaseServerKey.startsWith("sb_secret_")) headers.authorization = `Bearer ${supabaseServerKey}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    if (prefer) headers.prefer = prefer;
    const response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const message = payload?.message || payload?.error || payload?.hint || `Supabase HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function snapshotObject() {
    return {
      version: 1,
      settings: state.settings,
      goals: [...state.goals.values()],
      tasks: [...state.tasks.values()],
      events: [...state.events.entries()],
      approvals: [...state.approvals.values()],
      artifacts: [...state.artifacts.values()],
    };
  }

  async function writeSnapshot() {
    try {
      await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshotObject()), "utf8");
    } catch (error) {
      console.warn(`ARI autonomy snapshot write failed: ${error.message}`);
    }
  }

  async function loadSnapshot() {
    try {
      const parsed = JSON.parse(await fs.readFile(SNAPSHOT_PATH, "utf8"));
      if (parsed?.settings) state.settings = parsed.settings;
      for (const goal of parsed?.goals || []) state.goals.set(goal.id, goal);
      for (const task of parsed?.tasks || []) state.tasks.set(task.id, task);
      for (const [taskId, events] of parsed?.events || []) state.events.set(taskId, events);
      for (const approval of parsed?.approvals || []) state.approvals.set(approval.id, approval);
      for (const artifact of parsed?.artifacts || []) state.artifacts.set(artifact.id, artifact);
    } catch (error) {
      if (error?.code !== "ENOENT") console.warn(`ARI autonomy snapshot load failed: ${error.message}`);
    }
  }

  function hydrateRecord(row) {
    const item = row?.payload;
    if (!item || typeof item !== "object") return;
    switch (row.kind) {
      case "settings":
        state.settings = item;
        break;
      case "goal":
        state.goals.set(item.id, item);
        break;
      case "task":
        state.tasks.set(item.id, item);
        break;
      case "event": {
        const list = state.events.get(item.task_id) || [];
        if (!list.some((entry) => entry.id === item.id)) list.push(item);
        state.events.set(item.task_id, list);
        break;
      }
      case "approval":
        state.approvals.set(item.id, item);
        break;
      case "artifact":
        state.artifacts.set(item.id, item);
        break;
      default:
        break;
    }
  }

  async function hydrate() {
    if (state.hydrated) return;
    if (state.hydrationPromise) return state.hydrationPromise;
    state.hydrationPromise = (async () => {
      await loadSnapshot();
      if (supabaseUrl && supabaseServerKey) {
        state.last_storage_attempt = Date.now();
        try {
          const rows = await supabaseRequest(
            `/rest/v1/ari_autonomy_records?gid=eq.${encodeURIComponent(OWNER_GID)}&select=record_key,kind,status,parent_id,payload,created_at,updated_at&order=created_at.asc&limit=5000`,
          );
          for (const row of Array.isArray(rows) ? rows : []) hydrateRecord(row);
          state.storage = "supabase";
          state.storage_error = null;
        } catch (error) {
          state.storage = "memory";
          state.storage_error = error.message;
        }
      }
      state.hydrated = true;
      await writeSnapshot();
    })().finally(() => {
      state.hydrationPromise = null;
    });
    return state.hydrationPromise;
  }

  async function persist(kind, item, { parentId = null, status = null, recordKey = null } = {}) {
    await writeSnapshot();
    if (!supabaseUrl || !supabaseServerKey) return;
    const key = recordKey || `${kind}:${item.id || OWNER_GID}`;
    try {
      await supabaseRequest("/rest/v1/ari_autonomy_records?on_conflict=record_key", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          record_key: key,
          gid: OWNER_GID,
          kind,
          parent_id: parentId,
          status: status || item.status || null,
          payload: item,
          updated_at: now(),
        },
      });
      state.storage = "supabase";
      state.storage_error = null;
    } catch (error) {
      state.storage = "memory";
      state.storage_error = error.message;
    }
  }

  async function recordEvent(taskId, type, data = {}) {
    const list = state.events.get(taskId) || [];
    const event = {
      id: crypto.randomUUID(),
      task_id: taskId,
      sequence: list.length + 1,
      type,
      data,
      created_at: now(),
    };
    list.push(event);
    state.events.set(taskId, list);
    await persist("event", event, {
      parentId: taskId,
      status: type,
      recordKey: `event:${taskId}:${event.sequence}`,
    });
    return event;
  }

  async function innerJson(path, { method = "GET", body, requestId = crypto.randomUUID(), timeout = 20000 } = {}) {
    const response = await fetch(`${innerBase}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "x-request-id": requestId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || `ARI inner HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function recentObservations(taskId) {
    const events = state.events.get(taskId) || [];
    return events
      .filter((event) => event.type === "tool_succeeded")
      .slice(-6)
      .map((event) => `${event.data?.tool || "tool"}: ${JSON.stringify(event.data?.result || {})}`)
      .join("\n");
  }

  async function executeTool(step, task, goal) {
    switch (step.tool) {
      case "ari_health":
        return innerJson("/api/health", { requestId: crypto.randomUUID(), timeout: 8000 });
      case "mercury_health":
        return innerJson("/api/ready", { requestId: crypto.randomUUID(), timeout: 10000 });
      case "reasoning": {
        const observations = recentObservations(task.id);
        const intent = [
          `Autonomous goal: ${goal.intent}`,
          observations ? `Current observations:\n${observations}` : "",
          "Return a concise, evidence-aware result for the goal. Do not claim external actions were completed unless the observations prove they were completed.",
        ]
          .filter(Boolean)
          .join("\n\n");
        return innerJson("/api/runtime", {
          method: "POST",
          timeout: 30000,
          body: {
            gid: OWNER_GID,
            intent,
            capability: step.capability || "reasoning",
            module: "mercury",
            payload: { mode: "autonomous_step", goal_id: goal.id, task_id: task.id },
            context: { autonomy: true, goal_id: goal.id, task_id: task.id },
            request_id: crypto.randomUUID(),
          },
        });
      }
      case "create_private_artifact": {
        const artifact = {
          id: crypto.randomUUID(),
          gid: OWNER_GID,
          goal_id: goal.id,
          task_id: task.id,
          kind: "autonomy_report",
          title: goal.title || goal.intent.slice(0, 96),
          private: true,
          content: {
            goal: goal.intent,
            observations: (state.events.get(task.id) || [])
              .filter((event) => event.type === "tool_succeeded")
              .map((event) => ({ tool: event.data?.tool, result: event.data?.result })),
          },
          created_at: now(),
        };
        state.artifacts.set(artifact.id, artifact);
        await persist("artifact", artifact, { parentId: task.id, status: "created" });
        return { artifact_id: artifact.id, private: true };
      }
      default:
        throw new Error(`Tool ${step.tool} is not executable in ARI Autonomy V1`);
    }
  }

  function findPendingApproval(taskId, stepIndex) {
    return [...state.approvals.values()].find(
      (approval) => approval.task_id === taskId && approval.step_index === stepIndex && approval.status === "pending",
    );
  }

  async function createApproval(task, goal, step, stepIndex, reason) {
    const existing = findPendingApproval(task.id, stepIndex);
    if (existing) return existing;
    const approval = {
      id: crypto.randomUUID(),
      gid: OWNER_GID,
      goal_id: goal.id,
      task_id: task.id,
      step_index: stepIndex,
      tool: step.tool,
      title: step.title || step.tool,
      reason,
      risk: TOOL_REGISTRY[step.tool]?.risk || "unknown",
      status: "pending",
      created_at: now(),
      updated_at: now(),
    };
    state.approvals.set(approval.id, approval);
    await persist("approval", approval, { parentId: task.id, status: approval.status });
    await recordEvent(task.id, "approval_requested", { approval_id: approval.id, tool: step.tool, risk: approval.risk });
    return approval;
  }

  async function enqueueCloudTask(task) {
    if (!tasksProject || !tasksQueue || !publicUrl || !workerToken) return false;
    const token = await metadataAccessToken();
    const stepIndex = Number(task.step_index || 0);
    const taskName = `ari-${task.id.replace(/-/g, "")}-${stepIndex}`.slice(0, 100);
    const parent = `projects/${tasksProject}/locations/${tasksLocation}/queues/${tasksQueue}`;
    const httpRequest = {
      httpMethod: "POST",
      url: `${publicUrl}/internal/workers/execute-task`,
      headers: {
        "content-type": "application/json",
        "x-ari-worker-token": workerToken,
      },
      body: Buffer.from(JSON.stringify({ task_id: task.id })).toString("base64"),
    };
    if (tasksServiceAccount) httpRequest.oidcToken = { serviceAccountEmail: tasksServiceAccount, audience: publicUrl };
    const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ task: { name: `${parent}/tasks/${taskName}`, httpRequest } }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 409) return true;
    if (!response.ok) {
      const payload = await readJsonResponse(response);
      throw new Error(payload?.error?.message || `Cloud Tasks HTTP ${response.status}`);
    }
    return true;
  }

  async function dispatch(task) {
    task.dispatch = { requested_at: now(), mode: "local" };
    try {
      if (await enqueueCloudTask(task)) {
        task.dispatch = { requested_at: now(), mode: "cloud_tasks", queue: tasksQueue, location: tasksLocation };
        await persist("task", task, { parentId: task.goal_id, status: task.status });
        return;
      }
    } catch (error) {
      task.dispatch = { requested_at: now(), mode: "local_fallback", error: error.message };
      await recordEvent(task.id, "dispatch_fallback", { error: error.message });
    }
    await persist("task", task, { parentId: task.goal_id, status: task.status });
    setTimeout(() => executeTask(task.id).catch((error) => console.error("ARI autonomy local worker failed", error)), 0).unref();
  }

  async function completeTask(task, goal) {
    task.status = "succeeded";
    task.completed_at = now();
    task.updated_at = now();
    goal.status = "succeeded";
    goal.updated_at = now();
    await persist("task", task, { parentId: goal.id, status: task.status });
    await persist("goal", goal, { status: goal.status });
    await recordEvent(task.id, "task_succeeded", { goal_id: goal.id });
  }

  async function failTask(task, goal, error) {
    task.status = "failed";
    task.error = String(error?.message || error || "Unknown autonomy failure");
    task.updated_at = now();
    goal.status = "failed";
    goal.updated_at = now();
    await persist("task", task, { parentId: goal.id, status: task.status });
    await persist("goal", goal, { status: goal.status });
    await recordEvent(task.id, "task_failed", { error: task.error });
  }

  async function executeTask(taskId) {
    await hydrate();
    const task = state.tasks.get(taskId);
    if (!task) return { ok: false, reason: "task_not_found" };
    const goal = state.goals.get(task.goal_id);
    if (!goal) return { ok: false, reason: "goal_not_found" };
    if (!effectiveEnabled()) {
      task.status = "paused";
      task.updated_at = now();
      await persist("task", task, { parentId: goal.id, status: task.status });
      await recordEvent(task.id, "kill_switch_blocked", {});
      return { ok: true, status: task.status };
    }
    if (["succeeded", "failed", "cancelled"].includes(task.status)) return { ok: true, status: task.status };
    if (["paused", "awaiting_approval"].includes(task.status)) return { ok: true, status: task.status };
    if (["paused", "cancelled"].includes(goal.status)) return { ok: true, status: goal.status };

    const stepIndex = Number(task.step_index || 0);
    if (stepIndex >= task.plan.length) {
      await completeTask(task, goal);
      return { ok: true, status: task.status };
    }

    const step = task.plan[stepIndex];
    const stepKey = `${task.id}:${stepIndex}`;
    if (task.completed_step_keys?.includes(stepKey)) {
      task.step_index = stepIndex + 1;
      task.status = "queued";
      task.updated_at = now();
      await persist("task", task, { parentId: goal.id, status: task.status });
      return dispatch(task);
    }

    const policy = classifyPolicy(step, goal.mode);
    if (!policy.allowed) {
      await failTask(task, goal, new Error(`Ma'at blocked ${step.tool}: ${policy.reason}`));
      return { ok: false, status: task.status };
    }
    const approved = task.approved_step_keys?.includes(stepKey);
    if (policy.requiresApproval && !approved) {
      const approval = await createApproval(task, goal, step, stepIndex, goal.mode === "manual" ? "manual_mode" : "policy_gate");
      task.status = "awaiting_approval";
      task.approval_id = approval.id;
      task.updated_at = now();
      await persist("task", task, { parentId: goal.id, status: task.status });
      return { ok: true, status: task.status, approval_id: approval.id };
    }
    if (!policy.rule?.executable) {
      await failTask(task, goal, new Error(`Approved tool ${step.tool} is not installed in ARI Autonomy V1`));
      return { ok: false, status: task.status };
    }

    task.status = "running";
    task.updated_at = now();
    task.attempts = task.attempts || {};
    task.attempts[stepKey] = Number(task.attempts[stepKey] || 0) + 1;
    await persist("task", task, { parentId: goal.id, status: task.status });
    await recordEvent(task.id, "tool_started", { step_index: stepIndex, tool: step.tool, title: step.title || step.tool });

    try {
      const result = await executeTool(step, task, goal);
      await recordEvent(task.id, "tool_succeeded", { step_index: stepIndex, tool: step.tool, result });
      task.completed_step_keys = [...new Set([...(task.completed_step_keys || []), stepKey])];
      task.step_index = stepIndex + 1;
      task.error = null;
      task.approval_id = null;
      task.updated_at = now();
      if (task.step_index >= task.plan.length) {
        await completeTask(task, goal);
        return { ok: true, status: task.status };
      }
      task.status = "queued";
      await persist("task", task, { parentId: goal.id, status: task.status });
      await dispatch(task);
      return { ok: true, status: task.status };
    } catch (error) {
      await recordEvent(task.id, "tool_failed", { step_index: stepIndex, tool: step.tool, error: error.message });
      const attempt = Number(task.attempts[stepKey] || 1);
      if (attempt <= Number(task.max_retries ?? DEFAULT_MAX_RETRIES)) {
        task.status = "queued";
        task.error = error.message;
        task.updated_at = now();
        await persist("task", task, { parentId: goal.id, status: task.status });
        await dispatch(task);
        return { ok: false, status: task.status, retrying: true, error: error.message };
      }
      await failTask(task, goal, error);
      return { ok: false, status: task.status, error: error.message };
    }
  }

  async function createGoal(body) {
    const intent = String(body?.intent || body?.goal || "").trim();
    if (!intent) {
      const error = new Error("intent is required");
      error.status = 422;
      throw error;
    }
    const mode = ["manual", "supervised", "autonomous"].includes(String(body?.mode || "supervised"))
      ? String(body?.mode || "supervised")
      : "supervised";
    const requestedTools = Array.isArray(body?.allowed_tools) ? body.allowed_tools.map(String) : [];
    const allowedTools = requestedTools.length
      ? requestedTools.filter((tool) => Object.hasOwn(TOOL_REGISTRY, tool))
      : Object.entries(TOOL_REGISTRY).filter(([, rule]) => rule.auto).map(([tool]) => tool);
    const goal = {
      id: crypto.randomUUID(),
      gid: OWNER_GID,
      title: String(body?.title || "").trim() || intent.slice(0, 96),
      intent,
      mode,
      status: "draft",
      allowed_tools: allowedTools,
      max_steps: Math.max(1, Math.min(32, Number(body?.max_steps || DEFAULT_MAX_STEPS))),
      max_cost_usd: Math.max(0, Number(body?.max_cost_usd || 0)),
      created_at: now(),
      updated_at: now(),
    };
    state.goals.set(goal.id, goal);
    await persist("goal", goal, { status: goal.status });
    return goal;
  }

  async function startGoal(goal) {
    if (!effectiveEnabled()) {
      const error = new Error("ARI autonomy is disabled by the global kill switch");
      error.status = 409;
      throw error;
    }
    const existing = [...state.tasks.values()].find(
      (task) => task.goal_id === goal.id && ["queued", "running", "paused", "awaiting_approval"].includes(task.status),
    );
    if (existing) {
      if (existing.status === "paused") {
        existing.status = "queued";
        existing.updated_at = now();
        goal.status = "running";
        goal.updated_at = now();
        await persist("task", existing, { parentId: goal.id, status: existing.status });
        await persist("goal", goal, { status: goal.status });
        await recordEvent(existing.id, "task_resumed", {});
        await dispatch(existing);
      }
      return existing;
    }
    const plan = buildPlan(goal).filter((step) => goal.allowed_tools.includes(step.tool));
    if (!plan.length) {
      const error = new Error("Goal has no allowed executable steps");
      error.status = 422;
      throw error;
    }
    const task = {
      id: crypto.randomUUID(),
      gid: OWNER_GID,
      goal_id: goal.id,
      status: "queued",
      step_index: 0,
      plan,
      completed_step_keys: [],
      approved_step_keys: [],
      attempts: {},
      max_retries: DEFAULT_MAX_RETRIES,
      created_at: now(),
      updated_at: now(),
    };
    state.tasks.set(task.id, task);
    state.events.set(task.id, []);
    goal.status = "running";
    goal.updated_at = now();
    await persist("goal", goal, { status: goal.status });
    await persist("task", task, { parentId: goal.id, status: task.status });
    await recordEvent(task.id, "task_created", { goal_id: goal.id, plan });
    await dispatch(task);
    return task;
  }

  function getTaskEvents(taskId) {
    return state.events.get(taskId) || [];
  }

  function matches(pathname) {
    const path = normalizePath(pathname);
    return (
      path === "/autonomy" ||
      path.startsWith("/autonomy/") ||
      path === "/goals" ||
      path.startsWith("/goals/") ||
      path === "/tasks" ||
      path.startsWith("/tasks/") ||
      path === "/approvals" ||
      path.startsWith("/approvals/") ||
      path === "/artifacts" ||
      path.startsWith("/artifacts/") ||
      path === "/internal/workers/execute-task"
    );
  }

  async function handle(req, res, { pathname, raw, requestId }) {
    await hydrate();
    const path = normalizePath(pathname);
    let body = {};
    if (["POST", "PATCH", "PUT"].includes(req.method || "")) {
      try {
        body = parseBody(raw);
      } catch {
        return sendJson(res, 400, { ok: false, error: "Invalid JSON body", request_id: requestId }, requestId);
      }
    }

    try {
      if (path === "/autonomy" && req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          service: "ARI",
          runtime: "Mercury",
          autonomy: {
            enabled: effectiveEnabled(),
            environment_enabled: ENVIRONMENT_ENABLED,
            mode_default: "supervised",
            storage: state.storage,
            durable: state.storage === "supabase",
            storage_error: state.storage_error,
            cloud_tasks_configured: Boolean(tasksProject && tasksQueue && publicUrl && workerToken),
            queue: tasksQueue || null,
            location: tasksLocation,
            tool_registry: TOOL_REGISTRY,
          },
          request_id: requestId,
        }, requestId);
      }

      if (path === "/autonomy/enable" && req.method === "POST") {
        requireOwner(req);
        if (!ENVIRONMENT_ENABLED) {
          return sendJson(res, 409, { ok: false, error: "ARI_AUTONOMY_ENABLED=false is the global kill switch", request_id: requestId }, requestId);
        }
        state.settings = { ...state.settings, enabled: true, updated_at: now() };
        await persist("settings", state.settings, { status: "enabled", recordKey: `settings:${OWNER_GID}` });
        return sendJson(res, 200, { ok: true, autonomy_enabled: true, request_id: requestId }, requestId);
      }

      if (path === "/autonomy/disable" && req.method === "POST") {
        requireOwner(req);
        state.settings = { ...state.settings, enabled: false, updated_at: now() };
        for (const task of state.tasks.values()) {
          if (["queued", "running"].includes(task.status)) {
            task.status = "paused";
            task.updated_at = now();
            await persist("task", task, { parentId: task.goal_id, status: task.status });
            await recordEvent(task.id, "kill_switch_paused", {});
          }
        }
        await persist("settings", state.settings, { status: "disabled", recordKey: `settings:${OWNER_GID}` });
        return sendJson(res, 200, { ok: true, autonomy_enabled: false, request_id: requestId }, requestId);
      }

      if (path === "/goals" && req.method === "POST") {
        requireOwner(req);
        const goal = await createGoal(body);
        return sendJson(res, 201, { ok: true, goal: publicRecord(goal), request_id: requestId }, requestId);
      }

      if (path === "/goals" && req.method === "GET") {
        requireOwner(req);
        const goals = [...state.goals.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return sendJson(res, 200, { ok: true, goals: publicRecord(goals), request_id: requestId }, requestId);
      }

      const goalMatch = path.match(/^\/goals\/([^/]+)(?:\/(start|pause|cancel))?$/);
      if (goalMatch) {
        requireOwner(req);
        const [, goalId, action] = goalMatch;
        const goal = state.goals.get(goalId);
        if (!goal) return sendJson(res, 404, { ok: false, error: "Goal not found", request_id: requestId }, requestId);
        if (!action && req.method === "GET") return sendJson(res, 200, { ok: true, goal: publicRecord(goal), request_id: requestId }, requestId);
        if (!action && req.method === "PATCH") {
          if (goal.status === "running") return sendJson(res, 409, { ok: false, error: "Pause a running goal before changing its policy", request_id: requestId }, requestId);
          if (body.intent !== undefined) goal.intent = String(body.intent).trim() || goal.intent;
          if (body.title !== undefined) goal.title = String(body.title).trim() || goal.title;
          if (body.mode !== undefined && ["manual", "supervised", "autonomous"].includes(String(body.mode))) goal.mode = String(body.mode);
          if (body.allowed_tools !== undefined && Array.isArray(body.allowed_tools)) goal.allowed_tools = body.allowed_tools.map(String).filter((tool) => Object.hasOwn(TOOL_REGISTRY, tool));
          if (body.max_steps !== undefined) goal.max_steps = Math.max(1, Math.min(32, Number(body.max_steps) || goal.max_steps));
          if (body.max_cost_usd !== undefined) goal.max_cost_usd = Math.max(0, Number(body.max_cost_usd) || 0);
          goal.updated_at = now();
          await persist("goal", goal, { status: goal.status });
          return sendJson(res, 200, { ok: true, goal: publicRecord(goal), request_id: requestId }, requestId);
        }
        if (action === "start" && req.method === "POST") {
          const task = await startGoal(goal);
          return sendJson(res, 202, { ok: true, goal: publicRecord(goal), task: publicRecord(task), request_id: requestId }, requestId);
        }
        if (action === "pause" && req.method === "POST") {
          goal.status = "paused";
          goal.updated_at = now();
          for (const task of state.tasks.values()) {
            if (task.goal_id === goal.id && ["queued", "running"].includes(task.status)) {
              task.status = "paused";
              task.updated_at = now();
              await persist("task", task, { parentId: goal.id, status: task.status });
              await recordEvent(task.id, "task_paused", {});
            }
          }
          await persist("goal", goal, { status: goal.status });
          return sendJson(res, 200, { ok: true, goal: publicRecord(goal), request_id: requestId }, requestId);
        }
        if (action === "cancel" && req.method === "POST") {
          goal.status = "cancelled";
          goal.updated_at = now();
          for (const task of state.tasks.values()) {
            if (task.goal_id === goal.id && !["succeeded", "failed", "cancelled"].includes(task.status)) {
              task.status = "cancelled";
              task.updated_at = now();
              await persist("task", task, { parentId: goal.id, status: task.status });
              await recordEvent(task.id, "task_cancelled", {});
            }
          }
          await persist("goal", goal, { status: goal.status });
          return sendJson(res, 200, { ok: true, goal: publicRecord(goal), request_id: requestId }, requestId);
        }
      }

      if (path === "/tasks" && req.method === "GET") {
        requireOwner(req);
        const tasks = [...state.tasks.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return sendJson(res, 200, { ok: true, tasks: publicRecord(tasks), request_id: requestId }, requestId);
      }

      const taskMatch = path.match(/^\/tasks\/([^/]+)(?:\/(events|resume|pause|cancel|run))?$/);
      if (taskMatch) {
        requireOwner(req);
        const [, taskId, action] = taskMatch;
        const task = state.tasks.get(taskId);
        if (!task) return sendJson(res, 404, { ok: false, error: "Task not found", request_id: requestId }, requestId);
        if (!action && req.method === "GET") return sendJson(res, 200, { ok: true, task: publicRecord(task), request_id: requestId }, requestId);
        if (action === "events" && req.method === "GET") return sendJson(res, 200, { ok: true, events: publicRecord(getTaskEvents(taskId)), request_id: requestId }, requestId);
        if ((action === "resume" || action === "run") && req.method === "POST") {
          if (["succeeded", "cancelled"].includes(task.status)) return sendJson(res, 409, { ok: false, error: `Cannot resume ${task.status} task`, request_id: requestId }, requestId);
          task.status = "queued";
          task.updated_at = now();
          const goal = state.goals.get(task.goal_id);
          if (goal) { goal.status = "running"; goal.updated_at = now(); await persist("goal", goal, { status: goal.status }); }
          await persist("task", task, { parentId: task.goal_id, status: task.status });
          await recordEvent(task.id, "task_resumed", {});
          await dispatch(task);
          return sendJson(res, 202, { ok: true, task: publicRecord(task), request_id: requestId }, requestId);
        }
        if (action === "pause" && req.method === "POST") {
          task.status = "paused";
          task.updated_at = now();
          await persist("task", task, { parentId: task.goal_id, status: task.status });
          await recordEvent(task.id, "task_paused", {});
          return sendJson(res, 200, { ok: true, task: publicRecord(task), request_id: requestId }, requestId);
        }
        if (action === "cancel" && req.method === "POST") {
          task.status = "cancelled";
          task.updated_at = now();
          await persist("task", task, { parentId: task.goal_id, status: task.status });
          await recordEvent(task.id, "task_cancelled", {});
          return sendJson(res, 200, { ok: true, task: publicRecord(task), request_id: requestId }, requestId);
        }
      }

      if (path === "/approvals" && req.method === "GET") {
        requireOwner(req);
        const approvals = [...state.approvals.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return sendJson(res, 200, { ok: true, approvals: publicRecord(approvals), request_id: requestId }, requestId);
      }

      const approvalMatch = path.match(/^\/approvals\/([^/]+)\/(approve|reject)$/);
      if (approvalMatch && req.method === "POST") {
        requireOwner(req);
        const [, approvalId, action] = approvalMatch;
        const approval = state.approvals.get(approvalId);
        if (!approval) return sendJson(res, 404, { ok: false, error: "Approval not found", request_id: requestId }, requestId);
        if (approval.status !== "pending") return sendJson(res, 409, { ok: false, error: `Approval already ${approval.status}`, request_id: requestId }, requestId);
        approval.status = action === "approve" ? "approved" : "rejected";
        approval.updated_at = now();
        approval.decided_at = now();
        await persist("approval", approval, { parentId: approval.task_id, status: approval.status });
        const task = state.tasks.get(approval.task_id);
        const goal = task ? state.goals.get(task.goal_id) : null;
        if (task) {
          const stepKey = `${task.id}:${approval.step_index}`;
          if (action === "approve") {
            task.approved_step_keys = [...new Set([...(task.approved_step_keys || []), stepKey])];
            task.status = "queued";
            task.approval_id = null;
            task.updated_at = now();
            if (goal) { goal.status = "running"; goal.updated_at = now(); await persist("goal", goal, { status: goal.status }); }
            await persist("task", task, { parentId: task.goal_id, status: task.status });
            await recordEvent(task.id, "approval_granted", { approval_id: approval.id, tool: approval.tool });
            await dispatch(task);
          } else {
            task.status = "cancelled";
            task.updated_at = now();
            if (goal) { goal.status = "cancelled"; goal.updated_at = now(); await persist("goal", goal, { status: goal.status }); }
            await persist("task", task, { parentId: task.goal_id, status: task.status });
            await recordEvent(task.id, "approval_rejected", { approval_id: approval.id, tool: approval.tool });
          }
        }
        return sendJson(res, 200, { ok: true, approval: publicRecord(approval), task: publicRecord(task), request_id: requestId }, requestId);
      }

      if (path === "/artifacts" && req.method === "GET") {
        requireOwner(req);
        const artifacts = [...state.artifacts.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return sendJson(res, 200, { ok: true, artifacts: publicRecord(artifacts), request_id: requestId }, requestId);
      }

      const artifactMatch = path.match(/^\/artifacts\/([^/]+)$/);
      if (artifactMatch && req.method === "GET") {
        requireOwner(req);
        const artifact = state.artifacts.get(artifactMatch[1]);
        if (!artifact) return sendJson(res, 404, { ok: false, error: "Artifact not found", request_id: requestId }, requestId);
        return sendJson(res, 200, { ok: true, artifact: publicRecord(artifact), request_id: requestId }, requestId);
      }

      if (path === "/internal/workers/execute-task" && req.method === "POST") {
        requireWorker(req);
        const taskId = String(body?.task_id || "");
        if (!taskId) return sendJson(res, 422, { ok: false, error: "task_id is required", request_id: requestId }, requestId);
        const result = await executeTask(taskId);
        return sendJson(res, 200, { ok: true, worker: result, request_id: requestId }, requestId);
      }

      return sendJson(res, 404, { ok: false, error: "Autonomy route not found", request_id: requestId }, requestId);
    } catch (error) {
      const status = Number(error.status) || 500;
      return sendJson(res, status, { ok: false, error: error.message || "Autonomy runtime failure", request_id: requestId }, requestId);
    }
  }

  return { matches, handle, executeTask };
}
