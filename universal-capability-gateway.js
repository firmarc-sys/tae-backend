import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { enforceDistributedRateLimit } from "./device-fabric.js";
import {
  compileExecutionGraph,
  ensureCapabilityFabricSchema,
  getCapabilityCatalog,
  getExecutionGraph,
  persistExecutionGraph,
  registerCapability,
} from "./capability-fabric.js";

const outerPort = Number(process.env.PORT || 8080);
// 8082 is reserved by the manifest -> identity -> core runtime chain.
// Using it here causes secure-gateway and the core runtime to contend for
// the same loopback port once the authorization/production/billing layers
// wrap the full gateway stack in one Cloud Run container.
const innerPort = Number(process.env.UNIVERSAL_CAPABILITY_INNER_PORT || 8085);
const SESSION_COOKIE = "ari_session";
const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString
  ? new Pool({ connectionString, max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 })
  : null;
const db = () => {
  if (!pool) throw Object.assign(new Error("Neon is not configured on ARI"), { status: 503, code: "PERSISTENCE_UNAVAILABLE" });
  return pool;
};

const productionOrigins = new Set(
  (process.env.PRODUCTION_ALLOWED_ORIGINS || "https://siaas.space,https://www.siaas.space,https://siaas.netlify.app,https://main--siaas.netlify.app")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const developmentOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const allowedOrigins = process.env.NODE_ENV === "production" ? productionOrigins : new Set([...productionOrigins, ...developmentOrigins]);

const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  "cross-origin-resource-policy": "same-site",
});

const child = spawn(process.execPath, ["secure-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI secure gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function requestId(req) {
  return String(req.headers["x-request-id"] || crypto.randomUUID());
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return index === -1
      ? [decodeURIComponent(part), ""]
      : [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
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
  if (!gid || !signature || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function originFor(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return null;
  return allowedOrigins.has(origin) ? origin : false;
}

function corsHeaders(req) {
  const origin = originFor(req);
  if (!origin || origin === false) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,authorization,x-request-id,x-csrf-token",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-expose-headers": "x-request-id,x-runtime,x-capability-fabric",
    vary: "Origin",
  };
}

function json(req, res, status, body, id = requestId(req), extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify({ ...body, request_id: body?.request_id || id }));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-capability-fabric": "universal-v1",
    "x-request-id": id,
    ...extraHeaders,
  });
  res.end(data);
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("request body too large"), { status: 413, code: "PAYLOAD_TOO_LARGE" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function proxyHeaders(req, raw = null) {
  const headers = { ...req.headers, host: `127.0.0.1:${innerPort}` };
  if (raw) headers["content-length"] = String(raw.length);
  return headers;
}

function proxyBuffered(req, res, raw) {
  const upstream = http.request({ hostname: "127.0.0.1", port: innerPort, path: req.url, method: req.method, headers: proxyHeaders(req, raw) }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, ...corsHeaders(req), ...SECURITY_HEADERS, "x-capability-fabric": "universal-v1" });
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "INNER_RUNTIME_UNAVAILABLE", error: error.message }));
  upstream.end(raw);
}

function proxyStream(req, res) {
  const upstream = http.request({ hostname: "127.0.0.1", port: innerPort, path: req.url, method: req.method, headers: proxyHeaders(req) }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, ...corsHeaders(req), ...SECURITY_HEADERS, "x-capability-fabric": "universal-v1" });
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "INNER_RUNTIME_UNAVAILABLE", error: error.message }));
  req.pipe(upstream);
}

async function handleCatalog(req, res) {
  const id = requestId(req);
  await ensureCapabilityFabricSchema(db);
  const catalog = await getCapabilityCatalog(db);
  return json(req, res, 200, { ok: true, catalog }, id);
}

async function handleRegister(req, res) {
  const id = requestId(req);
  const gid = sessionGid(req);
  if (!gid) return json(req, res, 401, { ok: false, code: "AUTH_REQUIRED", error: "Authenticated GID required" }, id);
  if (gid !== OWNER_GID) return json(req, res, 403, { ok: false, code: "OWNER_REQUIRED", error: "Owner authority required" }, id);
  const raw = await readBody(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return json(req, res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body" }, id); }
  await ensureCapabilityFabricSchema(db);
  const capability = await registerCapability(db, body);
  return json(req, res, 201, { ok: true, capability }, id);
}

async function handleGraph(req, res, pathname) {
  const id = requestId(req);
  const gid = sessionGid(req);
  if (!gid) return json(req, res, 401, { ok: false, code: "AUTH_REQUIRED", error: "Authenticated GID required" }, id);
  await ensureCapabilityFabricSchema(db);
  if (req.method === "GET") {
    const graphId = decodeURIComponent(pathname.split("/").pop() || "");
    const graph = await getExecutionGraph(db, gid, graphId);
    if (!graph) return json(req, res, 404, { ok: false, code: "GRAPH_NOT_FOUND", error: "Execution graph not found" }, id);
    return json(req, res, 200, { ok: true, graph }, id);
  }
  const raw = await readBody(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return json(req, res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body" }, id); }
  const graph = compileExecutionGraph({ gid, intent: body.intent, capabilities: body.capabilities, context: body.context });
  await persistExecutionGraph(db, graph);
  return json(req, res, 201, { ok: true, graph }, id);
}

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const origin = originFor(req);
    if (origin === false) return json(req, res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" }, id);
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...corsHeaders(req), ...SECURITY_HEADERS, "access-control-max-age": "600" });
      return res.end();
    }

    if (pathname === "/api/capabilities" && req.method === "GET") return await handleCatalog(req, res);
    if (pathname === "/api/capabilities/register" && req.method === "POST") return await handleRegister(req, res);
    if (pathname.startsWith("/api/capabilities/graph/") && ["GET", "POST"].includes(req.method)) return await handleGraph(req, res, pathname);

    if (req.method === "POST" && (pathname === "/api/runtime" || pathname === "/runtime")) {
      const gid = sessionGid(req);
      const limit = await enforceDistributedRateLimit(db, {
        bucketKey: gid || String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anonymous").split(",")[0].trim(),
        routeClass: "runtime",
        limit: Math.max(10, Number(process.env.RUNTIME_RATE_LIMIT_PER_MINUTE || 60)),
        windowSeconds: 60,
      });
      if (!limit.allowed) return json(req, res, 429, { ok: false, code: "RATE_LIMITED", error: "Runtime rate limit exceeded", retry_after: limit.retryAfter }, id, { "retry-after": String(limit.retryAfter) });
      const raw = await readBody(req);
      return proxyBuffered(req, res, raw);
    }

    return proxyStream(req, res);
  } catch (error) {
    console.error("ARI universal capability gateway error", error);
    return json(req, res, Number(error?.status || 503), { ok: false, code: error?.code || "CAPABILITY_FABRIC_FAILURE", error: error?.message || "Capability fabric failure" }, id);
  }
}

const server = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, timeout = 30000) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", (error) => {
        socket.destroy();
        if (Date.now() >= deadline) reject(error); else setTimeout(attempt, 120);
      });
    };
    attempt();
  });
}

waitForPort(innerPort).then(() => {
  server.listen(outerPort, "0.0.0.0", () => console.log(`ARI universal capability gateway listening on ${outerPort}; secure inner ${innerPort}`));
}).catch((error) => {
  console.error(`ARI universal capability gateway readiness failed: ${error.message}`);
  if (!child.killed) child.kill("SIGTERM");
  process.exit(1);
});

function shutdown(signal) {
  console.log(`ARI universal capability gateway received ${signal}`);
  server.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
