import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.PRODUCTION_GATEWAY_INNER_PORT || 8090);
const OWNER_GID = String(process.env.SIOS_OWNER_GID || "399152573423");
const SESSION_COOKIE = "ari_session";
const SESSION_TTL_SECONDS = Math.max(3600, Number(process.env.ARI_SESSION_TTL_SECONDS || 2592000));
const sessionSecret = process.env.ARI_SESSION_SECRET || process.env.JWT_SECRET || "";
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString ? new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 }) : null;
const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const publicDomain = String(process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://jahorin.space").replace(/\/$/, "");

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

const child = spawn(process.execPath, ["billing-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI inner gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function db() {
  if (!pool) throw Object.assign(new Error("Neon identity authority is not configured"), { status: 503, code: "IDENTITY_AUTHORITY_UNAVAILABLE" });
  return pool;
}

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
    "access-control-allow-headers": "content-type,x-request-id,x-csrf-token,authorization",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-expose-headers": "x-request-id,x-runtime,x-identity-authority",
    vary: "Origin",
  };
}

function securityHeaders() {
  return {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-site",
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
    "x-identity-authority": "gid-neon-v1",
    "x-request-id": id,
    ...extra,
  });
  res.end(data);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const i = part.indexOf("=");
      return i === -1 ? [decodeURIComponent(part), ""] : [decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))];
    }),
  );
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function signSession(gid, expires) {
  if (!sessionSecret || sessionSecret === "CHANGE-ME-IN-PROD") throw Object.assign(new Error("ARI_SESSION_SECRET is required"), { status: 503 });
  const payload = `${gid}.${expires}`;
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function readSession(req) {
  if (!sessionSecret) return null;
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = token.split(".", 3);
  const expires = Number(expiresRaw);
  if (!gid || !signature || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? { gid, expires } : null;
}

function sessionCookie(gid) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = signSession(gid, expires);
  return {
    expires,
    header: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=None`,
  };
}

function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request body too large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid JSON"), { status: 400 }); }
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

async function identitySnapshot(gid) {
  const result = await db().query(
    `select ji.gid, ji.auth_user_id, ji.identity_scope, ji.display_name, ji.created_at, ji.updated_at,
            ia.user_type, ia.role_id, ia.tier_id, ia.status, ia.overrides,
            ar.permissions as role_permissions,
            at.limits as tier_limits
       from public.jahorin_identities ji
       left join public.identity_access ia on ia.gid=ji.gid
       left join public.access_roles ar on ar.id=ia.role_id
       left join public.access_tiers at on at.id=ia.tier_id
      where ji.gid=$1 limit 1`,
    [gid],
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  const owner = String(row.gid) === OWNER_GID || row.role_id === "prime_orchestrator" || row.tier_id === "owner";
  const entitlements = owner
    ? ["*"]
    : (await db().query(
      `select capability_id, operation from public.tier_entitlements where tier_id=$1 and allowed=true order by capability_id,operation`,
      [row.tier_id || "trial"],
    )).rows.map((item) => `${item.capability_id}.${item.operation}`);
  return {
    gid: String(row.gid),
    display_name: row.display_name || null,
    role: owner ? "prime_orchestrator" : (row.role_id || "subscriber"),
    tier: owner ? "owner" : (row.tier_id === "trial" ? "free" : (row.tier_id || "free")),
    status: row.status || "active",
    identity_scope: row.identity_scope || (owner ? "prime" : "consumer"),
    entitlements,
    limits: row.tier_limits || {},
  };
}

async function ensureIdentity(gid, { authUserId = null, displayName = null } = {}) {
  const owner = String(gid) === OWNER_GID;
  await db().query(
    `insert into public.jahorin_identities (gid,auth_user_id,identity_scope,display_name)
     values ($1,$2,$3,$4)
     on conflict (gid) do update set auth_user_id=coalesce(excluded.auth_user_id,public.jahorin_identities.auth_user_id),
       display_name=coalesce(excluded.display_name,public.jahorin_identities.display_name), updated_at=now()`,
    [gid, authUserId, owner ? "prime" : "consumer", displayName],
  );
  await db().query(
    `insert into public.identity_access (gid,user_type,role_id,tier_id,status)
     values ($1,$2,$3,$4,'active')
     on conflict (gid) do nothing`,
    owner ? [gid, "internal", "prime_orchestrator", "owner"] : [gid, "external", "subscriber", "trial"],
  );
}

async function innerJson(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`http://127.0.0.1:${innerPort}${path}`, {
    method,
    headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function handleSession(req, res) {
  const session = readSession(req);
  if (!session) return json(req, res, 200, { ok: true, authenticated: false, identity: null, entitlements: [] });
  const identity = await identitySnapshot(session.gid);
  if (!identity || identity.status !== "active") return json(req, res, 200, { ok: true, authenticated: false, identity: null, entitlements: [] }, { "set-cookie": clearCookie() });
  return json(req, res, 200, { ok: true, authenticated: true, identity, tier: identity.tier, role: identity.role, entitlements: identity.entitlements, expires: session.expires });
}

async function handleAuthorize(req, res) {
  checkAuthRate(req);
  const body = await readBody(req);
  const gid = String(body?.gid || "").trim();
  if (!/^\d{12}$/.test(gid)) return json(req, res, 400, { ok: false, authenticated: false, code: "INVALID_GID", error: "GID must be 12 digits" });
  const identity = await identitySnapshot(gid);
  if (!identity || identity.status !== "active") return json(req, res, 401, { ok: false, authenticated: false, code: "GID_NOT_AUTHORIZED", error: "GID not authorized", signup: { available: true, plan: "free" } });
  const cookie = sessionCookie(gid);
  return json(req, res, 200, { ok: true, authenticated: true, identity, tier: identity.tier, role: identity.role, entitlements: identity.entitlements, expires: cookie.expires }, { "set-cookie": cookie.header });
}

async function handleRegister(req, res) {
  checkAuthRate(req);
  const body = await readBody(req);
  const displayName = String(body?.display_name || body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!displayName || !email || password.length < 8) return json(req, res, 400, { ok: false, code: "SIGNUP_FIELDS_REQUIRED", error: "name, email, and an 8+ character password are required" });
  const { response, payload } = await innerJson("/api/auth/signup", { method: "POST", body: { display_name: displayName, email, password, plan: "free" } });
  if (!response.ok) return json(req, res, response.status, { ok: false, code: "SIGNUP_FAILED", error: payload?.error || payload?.message || "GID signup failed" });
  const user = payload?.user || null;
  const gid = String(user?.user_metadata?.gid || payload?.gid || "").trim();
  if (!/^\d{12}$/.test(gid)) return json(req, res, 502, { ok: false, code: "GID_ISSUE_FAILED", error: "Identity provider did not issue a valid GID" });
  await ensureIdentity(gid, { authUserId: user?.id || null, displayName });
  const identity = await identitySnapshot(gid);
  if (!payload?.access_token) return json(req, res, 201, { ok: true, authenticated: false, confirmation_required: true, identity, tier: "free", entitlements: identity?.entitlements || [], next: "confirm_email" });
  const cookie = sessionCookie(gid);
  return json(req, res, 201, { ok: true, authenticated: true, confirmation_required: false, identity, tier: "free", entitlements: identity?.entitlements || [], next: "enter_jahorin" }, { "set-cookie": cookie.header });
}

async function handleRecovery(req, res) {
  const body = await readBody(req);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return json(req, res, 400, { ok: false, error: "email is required" });
  if (!supabaseUrl || !supabaseAnonKey) return json(req, res, 503, { ok: false, error: "Recovery provider is not configured" });
  const response = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "content-type": "application/json" },
    body: JSON.stringify({ email, redirect_to: `${publicDomain}/?recovery=return` }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return json(req, res, response.status, { ok: false, error: "Recovery request failed" });
  return json(req, res, 200, { ok: true, recovery_sent: true });
}

async function handleProfile(req, res) {
  const session = readSession(req);
  if (!session) return json(req, res, 401, { ok: false, error: "Authenticated GID required" });
  const identity = await identitySnapshot(session.gid);
  if (req.method === "GET") return json(req, res, 200, { ok: true, identity });
  const body = await readBody(req);
  const displayName = String(body?.display_name || body?.name || "").trim();
  if (displayName) await db().query(`update public.jahorin_identities set display_name=$2,updated_at=now() where gid=$1`, [session.gid, displayName]);
  return json(req, res, 200, { ok: true, identity: await identitySnapshot(session.gid) });
}

async function handlePreferences(req, res) {
  const session = readSession(req);
  if (!session) return json(req, res, 401, { ok: false, error: "Authenticated GID required" });
  if (req.method === "GET") {
    const result = await db().query(`select preferences,updated_at from public.jahorin_preferences where gid=$1 limit 1`, [session.gid]);
    return json(req, res, 200, { ok: true, preferences: result.rows[0]?.preferences || {}, updated_at: result.rows[0]?.updated_at || null });
  }
  const body = await readBody(req);
  const prefs = body?.preferences && typeof body.preferences === "object" ? body.preferences : body;
  const result = await db().query(
    `insert into public.jahorin_preferences (gid,preferences) values ($1,$2::jsonb)
     on conflict (gid) do update set preferences=public.jahorin_preferences.preferences||excluded.preferences,updated_at=now()
     returning preferences,updated_at`, [session.gid, JSON.stringify(prefs || {})],
  );
  return json(req, res, 200, { ok: true, ...result.rows[0] });
}

async function handleTimeline(req, res) {
  const session = readSession(req);
  if (!session) return json(req, res, 401, { ok: false, error: "Authenticated GID required" });
  const limit = Math.max(1, Math.min(100, Number(new URL(req.url, "http://localhost").searchParams.get("limit") || 40)));
  const result = await db().query(`select id,intent,capability,page,request_id,state,created_at from public.jahorin_timeline where gid=$1 order by created_at desc limit $2`, [session.gid, limit]);
  return json(req, res, 200, { ok: true, timeline: result.rows });
}

async function handleProjects(req, res) {
  const session = readSession(req);
  if (!session) return json(req, res, 401, { ok: false, error: "Authenticated GID required" });
  if (req.method === "GET") {
    const result = await db().query(`select id,name,status,capability,page,next_action,weight,metadata,created_at,updated_at from public.jahorin_projects where gid=$1 order by updated_at desc limit 100`, [session.gid]);
    return json(req, res, 200, { ok: true, projects: result.rows });
  }
  const body = await readBody(req);
  const result = await db().query(
    `insert into public.jahorin_projects (gid,name,status,capability,page,next_action,weight,metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     returning id,name,status,capability,page,next_action,weight,metadata,created_at,updated_at`,
    [session.gid, String(body?.name || "Untitled Project"), String(body?.status || "active"), body?.capability || null, body?.page || null, body?.next_action || null, Number(body?.weight || 1), JSON.stringify(body?.metadata || {})],
  );
  return json(req, res, 201, { ok: true, project: result.rows[0] });
}

function proxy(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${innerPort}` },
  };
  const upstream = http.request(options, (upstreamRes) => {
    const headers = { ...upstreamRes.headers, ...corsHeaders(req), ...securityHeaders() };
    res.writeHead(upstreamRes.statusCode || 502, headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, error: `ARI inner gateway unavailable: ${error.message}` }));
  req.pipe(upstream);
}

const gateway = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "OPTIONS") return json(req, res, 204, {});
  if (originFor(req) === false) return json(req, res, 403, { ok: false, error: "Origin not allowed" });
  try {
    if (pathname === "/api/identity/session" && req.method === "GET") return await handleSession(req, res);
    if (pathname === "/api/identity/authorize" && req.method === "POST") return await handleAuthorize(req, res);
    if (pathname === "/api/identity/register" && req.method === "POST") return await handleRegister(req, res);
    if (pathname === "/api/identity/logout" && req.method === "POST") return json(req, res, 200, { ok: true, authenticated: false }, { "set-cookie": clearCookie() });
    if (pathname === "/api/identity/recovery" && req.method === "POST") return await handleRecovery(req, res);
    if (pathname === "/api/identity/profile" && ["GET", "PATCH"].includes(req.method)) return await handleProfile(req, res);
    if (pathname === "/api/identity/preferences" && ["GET", "PATCH", "POST"].includes(req.method)) return await handlePreferences(req, res);
    if (pathname === "/api/identity/timeline" && req.method === "GET") return await handleTimeline(req, res);
    if (pathname === "/api/identity/projects" && ["GET", "POST"].includes(req.method)) return await handleProjects(req, res);
    return proxy(req, res);
  } catch (error) {
    console.error("ARI production gateway error", error);
    return json(req, res, Number(error?.status || 500), { ok: false, code: error?.code || "ARI_ERROR", error: error?.message || "ARI request failed" });
  }
});

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
  gateway.listen(outerPort, "0.0.0.0", () => console.log(`ARI production gateway listening on ${outerPort}; inner chain on ${innerPort}`));
}).catch((error) => {
  console.error(`ARI production gateway readiness failed: ${error.message}`);
  if (!child.killed) child.kill("SIGTERM");
  process.exit(1);
});

function shutdown(signal) {
  console.log(`ARI production gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
