import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.CREDENTIAL_GATEWAY_INNER_PORT || 8094);
const OWNER_GID = String(process.env.SIOS_OWNER_GID || "399152573423");
const ownerAccessCode = String(process.env.OWNER_ACCESS_CODE || process.env.SIOS_OWNER_ACCESS_CODE || "");
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString ? new Pool({ connectionString, max: 4, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 }) : null;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const allowedOrigins = new Set(
  (process.env.PRODUCTION_ALLOWED_ORIGINS || [
    "https://jahorin.space",
    "https://www.jahorin.space",
    "https://jahorin-ga.vercel.app",
    "https://siaas.space",
    "https://www.siaas.space",
    "http://localhost:5173",
  ].join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

let childReady = false;
let childExit = null;
const child = spawn(process.execPath, ["authorization-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  childReady = false;
  childExit = { code, signal: signal || null, at: new Date().toISOString() };
});

function requestId(req) {
  return String(req.headers["x-request-id"] || crypto.randomUUID());
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
    vary: "Origin",
  };
}

function securityHeaders() {
  return {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  };
}

function json(req, res, status, body, extra = {}) {
  const id = requestId(req);
  const data = Buffer.from(JSON.stringify({ ...body, request_id: body?.request_id || id }));
  res.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-credential-authority": "gid-proof-v1",
    "x-request-id": id,
    ...extra,
  });
  res.end(data);
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readBody(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request body too large"), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid JSON"), { status: 400, code: "INVALID_JSON" }); }
}

const authAttempts = new Map();
function checkAuthRate(req) {
  const key = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || now - current.started > 60000) {
    authAttempts.set(key, { started: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 8) throw Object.assign(new Error("Too many identity attempts. Retry shortly."), { status: 429, code: "RATE_LIMITED" });
}

function db() {
  if (!pool) throw Object.assign(new Error("Neon identity authority is not configured"), { status: 503, code: "IDENTITY_AUTHORITY_UNAVAILABLE" });
  return pool;
}

async function authBindingForGid(gid) {
  const result = await db().query(
    `select ji.auth_user_id, ia.status
       from public.jahorin_identities ji
       left join public.identity_access ia on ia.gid=ji.gid
      where ji.gid=$1 limit 1`,
    [gid],
  );
  const row = result.rows[0] || null;
  if (!row || row.status === "disabled" || row.status === "revoked") return null;
  return row.auth_user_id ? { authUserId: String(row.auth_user_id) } : null;
}

async function supabaseAdminUser(authUserId) {
  if (!supabaseUrl || !supabaseServerKey) {
    throw Object.assign(new Error("Supabase credential authority is not configured"), { status: 503, code: "CREDENTIAL_AUTHORITY_UNAVAILABLE" });
  }
  const headers = { apikey: supabaseServerKey, Accept: "application/json" };
  if (!supabaseServerKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${supabaseServerKey}`;
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw Object.assign(new Error("Credential identity could not be resolved"), { status: response.status >= 500 ? 503 : 401, code: "CREDENTIAL_IDENTITY_UNAVAILABLE" });
  }
  const user = await response.json();
  if (!user?.id || !user?.email) throw Object.assign(new Error("Credential identity is incomplete"), { status: 401, code: "CREDENTIAL_IDENTITY_INVALID" });
  return user;
}

async function innerJson(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`http://127.0.0.1:${innerPort}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function verifyMemberPassword(gid, password) {
  const binding = await authBindingForGid(gid);
  if (!binding?.authUserId) return false;
  const user = await supabaseAdminUser(binding.authUserId);
  const login = await innerJson("/api/auth/login", {
    method: "POST",
    body: { email: user.email, password },
  });
  if (!login.response.ok) return false;
  const authenticatedUser = login.payload?.user || null;
  if (!authenticatedUser?.id || String(authenticatedUser.id) !== binding.authUserId) return false;
  const authenticatedGid = String(authenticatedUser?.user_metadata?.gid || "").trim();
  return !authenticatedGid || authenticatedGid === gid;
}

async function mintInnerSession(req, res, gid) {
  const { response, payload } = await innerJson("/api/identity/authorize", {
    method: "POST",
    body: { gid },
    headers: {
      ...(req.headers.origin ? { origin: req.headers.origin } : {}),
      "x-request-id": requestId(req),
    },
  });
  const setCookie = response.headers.get("set-cookie");
  return json(req, res, response.status, payload, setCookie ? { "set-cookie": setCookie } : {});
}

async function handleAuthorize(req, res) {
  checkAuthRate(req);
  const body = await readBody(req);
  const gid = String(body?.gid || "").replace(/\s+/g, "");
  const password = String(body?.password || body?.credential || "");
  if (!/^\d{12}$/.test(gid)) return json(req, res, 400, { ok: false, authenticated: false, code: "INVALID_GID", error: "GID must be 12 digits" });
  if (!password) return json(req, res, 400, { ok: false, authenticated: false, code: "CREDENTIAL_REQUIRED", error: "GID credential is required" });

  let verified = false;
  if (gid === OWNER_GID) {
    if (!ownerAccessCode) throw Object.assign(new Error("Prime Orchestrator credential is not configured"), { status: 503, code: "OWNER_CREDENTIAL_UNAVAILABLE" });
    verified = timingSafeEqualText(password, ownerAccessCode);
  } else {
    verified = await verifyMemberPassword(gid, password);
  }

  if (!verified) return json(req, res, 401, { ok: false, authenticated: false, code: "CREDENTIAL_NOT_AUTHORIZED", error: "GID credential not authorized" });
  return mintInnerSession(req, res, gid);
}

function proxyStream(req, res) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${innerPort}` },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: `ARI inner gateway unavailable: ${error.message}` }));
  req.pipe(upstream);
}

const gateway = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    if (originFor(req) === false) return json(req, res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...corsHeaders(req), ...securityHeaders(), "access-control-max-age": "600" });
      return res.end();
    }
    if (pathname === "/api/credential-edge") {
      return json(req, res, childReady ? 200 : 503, {
        ok: childReady,
        credential_gate: "gid-proof-v1",
        child_ready: childReady,
        child_exit: childExit,
      });
    }
    if (req.method === "POST" && pathname === "/api/identity/authorize") return await handleAuthorize(req, res);
    if (!childReady) return json(req, res, 503, { ok: false, code: "INNER_CHAIN_NOT_READY", error: "ARI inner authorization chain is not ready", child_exit: childExit });
    return proxyStream(req, res);
  } catch (error) {
    console.error("ARI credential gateway error", error);
    return json(req, res, Number(error?.status || 503), {
      ok: false,
      authenticated: false,
      code: error?.code || "CREDENTIAL_AUTHORIZATION_FAILURE",
      error: error?.message || "Credential authorization failed",
    });
  }
});

function waitForPort(port, { timeout = 120000, interval = 120 } = {}) {
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

gateway.listen(outerPort, "0.0.0.0", () => {
  console.log(`ARI credential edge listening on ${outerPort}; awaiting authorization inner ${innerPort}`);
});

waitForPort(innerPort)
  .then(() => {
    childReady = true;
    console.log(`ARI authorization inner chain reachable on ${innerPort}`);
  })
  .catch((error) => {
    childReady = false;
    childExit = { code: null, signal: null, at: new Date().toISOString(), error: error.message };
    console.error(`ARI credential edge readiness failed: ${error.message}`);
  });

function shutdown(signal) {
  console.log(`ARI credential gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
