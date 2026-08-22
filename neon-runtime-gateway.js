import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  neonConfigured,
  neonHealth,
  ensureNeonIdentity,
  getTwinState,
  mergeTwinState,
  setTwinPermissions,
  setTwinPreferences,
  recordTwinEvent,
  incrementCapabilityUsage,
  recordPrediction,
  listPredictions,
  resolveLatestPrediction,
  adjustTwinConfidence,
  recordTimeline,
  getTimeline,
  clearTwin,
} from "./neon-store.js";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.NEON_GATEWAY_INNER_PORT || 8083);
const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const OWNER_MODE = "Prime Orchestrator";
const SESSION_COOKIE = "ari_session";
const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");

const child = spawn(process.execPath, ["manifest-runtime-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI manifest runtime exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function requestId(req) {
  return String(req.headers["x-request-id"] || crypto.randomUUID());
}

function json(res, status, body, id, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    ...(id ? { "x-request-id": id } : {}),
    ...extraHeaders,
  });
  res.end(data);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
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

function sessionGid(req) {
  if (!sessionSecret) return null;
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = token.split(".", 3);
  const expires = Number(expiresRaw);
  if (!gid || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("request body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function proxyHeaders(req) {
  const headers = { ...req.headers };
  headers.host = `127.0.0.1:${innerPort}`;
  return headers;
}

async function innerJson(req, raw = null) {
  const response = await fetch(`http://127.0.0.1:${innerPort}${req.url}`, {
    method: req.method,
    headers: proxyHeaders(req),
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : raw,
    signal: AbortSignal.timeout(45_000),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload, text };
}

function passthroughHeaders(response) {
  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    if (["content-length", "transfer-encoding", "connection"].includes(key.toLowerCase())) continue;
    headers[key] = value;
  }
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) headers["set-cookie"] = setCookie;
  return headers;
}

function proxyStream(req, res) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: proxyHeaders(req),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(res, 503, { ok: false, error: `ARI runtime unavailable: ${error.message}` }, requestId(req)));
  req.pipe(upstream);
}

async function requireGid(req) {
  const gid = sessionGid(req);
  if (!gid) throw Object.assign(new Error("Authenticated ARI session required"), { status: 401 });
  if (!neonConfigured) throw Object.assign(new Error("Neon persistence is not configured"), { status: 503 });
  await ensureNeonIdentity({
    gid,
    identityScope: gid === OWNER_GID ? "prime" : "consumer",
    displayName: gid === OWNER_GID ? OWNER_MODE : null,
  });
  return gid;
}

function base(extra = {}) {
  return { ok: true, gid: null, mode: "public", timestamp: new Date().toISOString(), ...extra };
}

async function handleHealth(req, res, id) {
  const { response, payload } = await innerJson(req);
  return json(res, response.status, {
    ...(payload || {}),
    neon_configured: neonConfigured,
    twin_persistence: neonConfigured ? "neon" : "unconfigured",
  }, id, passthroughHeaders(response));
}

async function handleReady(req, res, id) {
  const [{ response, payload }, neonReady] = await Promise.all([innerJson(req), neonHealth()]);
  const innerReady = response.ok && payload?.ok !== false;
  const ready = innerReady && neonReady;
  return json(res, ready ? 200 : 503, {
    ...(payload || {}),
    ok: ready,
    ready,
    neon_configured: neonConfigured,
    neon_ready: neonReady,
    twin_persistence_ready: neonReady,
    twin_persistence: "neon",
  }, id, passthroughHeaders(response));
}

async function handleIdentityGuest(req, res, raw, id) {
  const { response, payload } = await innerJson(req, raw);
  if (response.ok && payload?.gid) {
    await ensureNeonIdentity({
      gid: String(payload.gid),
      identityScope: "consumer",
      displayName: String(payload?.display_name || "").trim() || null,
    });
  }
  return json(res, response.status, {
    ...(payload || {}),
    ...(response.ok ? { persistence: "neon", cloud_sync: true } : {}),
  }, id, passthroughHeaders(response));
}

async function handleIdentity(req, res, raw, id) {
  const { response, payload } = await innerJson(req, raw);
  const gid = payload?.gid || payload?.identity?.gid || payload?.result?.gid || null;
  if (response.ok && payload?.authenticated && gid) {
    const identity = await ensureNeonIdentity({
      gid: String(gid),
      identityScope: String(gid) === OWNER_GID ? "prime" : "consumer",
      displayName: String(gid) === OWNER_GID ? OWNER_MODE : payload?.user?.display_name || null,
    });
    payload.identity_persistence = "neon";
    payload.cloud_sync = true;
    payload.persisted_identity = identity;
  }
  return json(res, response.status, payload || {}, id, passthroughHeaders(response));
}

async function handleTwin(req, res, raw, pathname, id) {
  const gid = await requireGid(req);
  const body = raw?.length ? JSON.parse(raw.toString("utf8")) : {};

  if (req.method === "GET" && pathname === "/api/twin") {
    return json(res, 200, base({ gid, twin: await getTwinState(gid), persistence: "neon", cloud_sync: true }), id);
  }
  if (req.method === "DELETE" && pathname === "/api/twin") {
    await clearTwin(gid);
    return json(res, 200, base({ gid, cleared: true, twin: await getTwinState(gid), persistence: "neon", cloud_sync: true }), id);
  }
  if (req.method === "GET" && pathname === "/api/twin/predictions") {
    return json(res, 200, base({ gid, predictions: await listPredictions(gid, new URL(req.url, "http://localhost").searchParams.get("limit")), persistence: "neon", cloud_sync: true }), id);
  }
  if (req.method === "POST" && pathname === "/api/twin/context") {
    if (body.permissions && typeof body.permissions === "object") await setTwinPermissions(gid, body.permissions);
    if (body.preferences && typeof body.preferences === "object") await setTwinPreferences(gid, body.preferences);
    await recordTwinEvent(gid, "context", body);
    await mergeTwinState(gid, { state: { lastContext: body, lastContextAt: new Date().toISOString() } });
  } else if (req.method === "POST" && pathname === "/api/twin/interaction") {
    await recordTwinEvent(gid, "interaction", body);
    if (body.capability) await incrementCapabilityUsage(gid, body.capability);
    await mergeTwinState(gid, { state: { lastInteraction: body, lastInteractionAt: new Date().toISOString() } });
  } else if (req.method === "POST" && pathname === "/api/twin/outcome") {
    await recordTwinEvent(gid, "outcome", body);
    const type = String(body.type || "").toLowerCase();
    if (type.includes("accepted")) { await adjustTwinConfidence(gid, 0.012); await resolveLatestPrediction(gid, "accepted"); }
    if (type.includes("rejected")) { await adjustTwinConfidence(gid, -0.018); await resolveLatestPrediction(gid, "rejected"); }
    if (type.includes("confirmed")) { await adjustTwinConfidence(gid, 0.008); await resolveLatestPrediction(gid, "confirmed"); }
  } else if (req.method === "POST" && pathname === "/api/twin/correction") {
    await recordTwinEvent(gid, "correction", body);
    await adjustTwinConfidence(gid, 0.025);
    await mergeTwinState(gid, { state: { lastCorrection: body, lastCorrectionAt: new Date().toISOString() } });
  } else {
    return json(res, 405, { ok: false, error: "Method not allowed", request_id: id }, id);
  }

  return json(res, 200, base({ gid, accepted: true, twin: await getTwinState(gid), persistence: "neon", cloud_sync: true }), id);
}

async function handleTimeline(req, res, raw, pathname, id) {
  const gid = await requireGid(req);
  if (req.method === "GET") {
    const limit = new URL(req.url, "http://localhost").searchParams.get("limit");
    return json(res, 200, base({ gid, turns: await getTimeline(gid, limit), persistence: "neon", cloud_sync: true }), id);
  }
  if (req.method === "POST") {
    const body = raw?.length ? JSON.parse(raw.toString("utf8")) : {};
    const turn = await recordTimeline(gid, body);
    return json(res, 200, base({ gid, accepted: true, turn, persistence: "neon", cloud_sync: true }), id);
  }
  return json(res, 405, { ok: false, error: "Method not allowed", request_id: id }, id);
}

async function handleState(req, res, pathname, id) {
  const gid = await requireGid(req);
  const targetGid = decodeURIComponent(pathname.slice("/api/state/".length));
  if (!targetGid) return json(res, 400, { ok: false, error: "GID required", request_id: id }, id);
  if (targetGid !== gid && gid !== OWNER_GID) return json(res, 403, { ok: false, error: "GID state access denied", request_id: id }, id);
  await ensureNeonIdentity({ gid: targetGid, identityScope: targetGid === OWNER_GID ? "prime" : "consumer" });
  const [twin, timeline] = await Promise.all([getTwinState(targetGid), getTimeline(targetGid, 20)]);
  return json(res, 200, base({ gid: targetGid, state: { twin, timeline }, persistence: "neon", cloud_sync: true }), id);
}

function manifestFromPayload(payload = {}, requestBody = {}) {
  const manifest = payload.manifest || payload.render_manifest || payload.scene_manifest || payload.result?.manifest || {};
  return {
    intent: String(requestBody.intent || requestBody?.payload?.prompt || "").trim(),
    capability: String(payload.capability || manifest.capability || manifest.machine || requestBody.capability || "novalife").toLowerCase(),
    page: String(payload.page || manifest.page || manifest.view || manifest.scene || "home-room").toLowerCase(),
    confidence: Number(payload.confidence ?? manifest.confidence ?? 0.72),
    reason: payload.reason || manifest.reason || null,
    requires_confirmation: Boolean(payload.requires_confirmation ?? manifest.requires_confirmation),
  };
}

async function handleRuntime(req, res, raw, id) {
  const gid = await requireGid(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
  catch { return json(res, 400, { ok: false, error: "Invalid JSON body", request_id: id }, id); }

  await recordTwinEvent(gid, "runtime_request", {
    intent: body.intent || body?.payload?.prompt || null,
    requested_capability: body.capability || null,
    context: body.context || {},
    request_id: body.request_id || id,
  });

  const { response, payload } = await innerJson(req, raw);
  if (!response.ok || payload?.ok === false) {
    await recordTwinEvent(gid, "runtime_error", { request_id: body.request_id || id, status: response.status, error: payload?.error || payload?.message || "runtime failed" });
    return json(res, response.status, payload || { ok: false, error: "runtime failed" }, id, passthroughHeaders(response));
  }

  const manifest = manifestFromPayload(payload, body);
  await incrementCapabilityUsage(gid, manifest.capability);
  await recordPrediction(gid, manifest, body.context || {});
  await recordTimeline(gid, {
    intent: manifest.intent,
    capability: manifest.capability,
    page: manifest.page,
    request_id: body.request_id || id,
    state: { manifest, source: body?.payload?.source || null },
  });
  await recordTwinEvent(gid, "runtime_result", {
    request_id: body.request_id || id,
    capability: manifest.capability,
    page: manifest.page,
    confidence: manifest.confidence,
    provider: payload?.provider || null,
  });

  return json(res, response.status, {
    ...(payload || {}),
    persistence: "neon",
    cloud_sync: true,
  }, id, passthroughHeaders(response));
}

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    if (req.method === "GET" && pathname === "/api/health") return await handleHealth(req, res, id);
    if (req.method === "GET" && pathname === "/api/ready") return await handleReady(req, res, id);

    const needsBody = !["GET", "HEAD"].includes(req.method || "GET");
    let raw = null;
    if (
      pathname === "/api/identity/guest" ||
      pathname === "/api/identity" ||
      pathname === "/api/runtime" ||
      pathname === "/api/timeline" ||
      pathname === "/api/twin" ||
      pathname.startsWith("/api/twin/")
    ) {
      raw = needsBody ? await readBody(req) : Buffer.alloc(0);
    }

    if (pathname === "/api/identity/guest" && req.method === "POST") return await handleIdentityGuest(req, res, raw, id);
    if (pathname === "/api/identity" && ["GET", "POST"].includes(req.method)) return await handleIdentity(req, res, raw, id);
    if (pathname === "/api/runtime" && req.method === "POST") return await handleRuntime(req, res, raw, id);
    if (pathname === "/api/timeline") return await handleTimeline(req, res, raw, pathname, id);
    if (pathname === "/api/twin" || pathname.startsWith("/api/twin/")) return await handleTwin(req, res, raw, pathname, id);
    if (req.method === "GET" && pathname.startsWith("/api/state/")) return await handleState(req, res, pathname, id);

    return proxyStream(req, res);
  } catch (error) {
    console.error("Neon ARI gateway error", error);
    return json(res, Number(error.status) || 503, {
      ok: false,
      error: error.message || "Neon persistence failure",
      request_id: id,
    }, id);
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, { timeout = 20_000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", (error) => {
        socket.destroy();
        if (Date.now() >= deadline) reject(error);
        else setTimeout(attempt, interval);
      });
    };
    attempt();
  });
}

waitForPort(innerPort)
  .then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`Jahorin Neon persistence gateway ${outerPort}; inner ARI ${innerPort}; neon=${neonConfigured}`)))
  .catch((error) => {
    console.error(`ARI child runtime failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`Neon persistence gateway received ${signal}`);
  gateway.close(() => {
    if (!child.killed) child.kill("SIGTERM");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
