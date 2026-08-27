import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.SUBSCRIPTION_ENTITLEMENT_INNER_PORT || 8087);
const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const SESSION_COOKIE = "ari_session";
const TOKEN_MATRIX_VERSION = "1.0.0";

const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString
  ? new Pool({ connectionString, max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 })
  : null;

const child = spawn(process.execPath, ["universal-capability-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI universal gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function db() {
  if (!pool) throw Object.assign(new Error("Neon is not configured on ARI"), { status: 503, code: "ENTITLEMENT_AUTHORITY_UNAVAILABLE" });
  return pool;
}

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
    "x-entitlement-authority": "neon-v1",
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

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

async function bearerPrincipal(req) {
  const token = bearerToken(req);
  if (!token) return null;
  if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error("Member authentication is not configured"), { status: 503 });
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw Object.assign(new Error("Invalid member authentication"), { status: 401 });
  return {
    kind: "member",
    user_id: user.id,
    gid: user.user_metadata?.gid ? String(user.user_metadata.gid) : null,
    email: user.email || null,
  };
}

async function principal(req) {
  const gid = sessionGid(req);
  if (gid) return { kind: gid === OWNER_GID ? "owner" : "consumer", gid };
  return bearerPrincipal(req);
}

function publicTier(internalTier) {
  const value = String(internalTier || "").trim().toLowerCase();
  if (value === "owner") return "owner";
  if (value === "personal" || value === "beta") return "personal";
  if (value === "pro" || value === "alpha") return "pro";
  if (value === "business") return "business";
  if (value === "enterprise") return "enterprise";
  return "free";
}

function subscriptionStatus(row) {
  if (!row) return "free";
  if (row.tier_id === "owner") return "active";
  const billing = row.overrides?.billing;
  const raw = String(billing?.subscription_status || "").trim().toLowerCase();
  if (raw) return raw;
  return publicTier(row.tier_id) === "free" ? "free" : row.status === "active" ? "active" : String(row.status || "inactive");
}

async function resolveGidFromAuthUser(authUserId) {
  if (!authUserId) return null;
  const result = await db().query(
    `select gid from public.jahorin_identities where auth_user_id=$1 order by updated_at desc limit 1`,
    [authUserId],
  );
  return result.rows[0]?.gid ? String(result.rows[0].gid) : null;
}

async function entitlementSnapshot(gid) {
  if (!gid) return null;
  const access = await db().query(
    `select
       ia.gid, ia.user_type, ia.role_id, ia.tier_id, ia.status, ia.overrides,
       ar.enabled as role_enabled, ar.permissions as role_permissions,
       at.enabled as tier_enabled, at.limits as tier_limits, at.metadata as tier_metadata
     from public.identity_access ia
     left join public.access_roles ar on ar.id=ia.role_id
     left join public.access_tiers at on at.id=ia.tier_id
     where ia.gid=$1
     limit 1`,
    [gid],
  );
  const row = access.rows[0];
  if (!row) return null;

  const ownerWildcard = row.role_permissions?.["*"] === true || String(row.gid) === OWNER_GID || row.tier_id === "owner";
  const entitlements = ownerWildcard
    ? { rows: [] }
    : await db().query(
      `select capability_id, operation, allowed, limits
       from public.tier_entitlements
       where tier_id=$1
       order by capability_id, operation`,
      [row.tier_id],
    );

  const direct = entitlements.rows
    .filter((item) => item.allowed === true)
    .map((item) => `${item.capability_id}.${item.operation}`);
  const overrideEntitlements = row.overrides?.entitlements && typeof row.overrides.entitlements === "object"
    ? row.overrides.entitlements
    : {};
  const grants = new Set(ownerWildcard ? ["*"] : direct);
  for (const [grant, allowed] of Object.entries(overrideEntitlements)) {
    if (allowed === true) grants.add(grant);
    if (allowed === false) grants.delete(grant);
  }

  return {
    ok: true,
    version: TOKEN_MATRIX_VERSION,
    authority: "ARI/Neon",
    gid: String(row.gid),
    user_type: row.user_type,
    role: row.role_id,
    tier: publicTier(row.tier_id),
    internal_tier: row.tier_id,
    status: subscriptionStatus(row),
    enabled: row.status === "active" && row.role_enabled !== false && row.tier_enabled !== false,
    grants: [...grants].sort(),
    limits: row.tier_limits || null,
    resolution_order: ["gid", "subscription", "entitlements", "tokens", "capability", "action"],
  };
}

async function snapshotForRequest(req) {
  const actor = await principal(req);
  if (!actor) return null;
  let gid = actor.gid || null;
  if (!gid && actor.user_id) gid = await resolveGidFromAuthUser(actor.user_id);
  if (!gid) return null;
  return entitlementSnapshot(gid);
}

function canonicalGrant(grant = "") {
  const pieces = String(grant || "").trim().toLowerCase().split(".").filter(Boolean);
  if (pieces.length < 2) return String(grant || "").trim().toLowerCase();
  const aliases = {
    wepwawet: "interweb",
    hathor: "augment",
    syncori: "augment",
    ptah: "code",
    thoth: "scribe",
    chat: "scribe",
    horus: "optics",
  };
  const capability = aliases[pieces[0]] || pieces[0];
  return `${capability}.${pieces[1]}`;
}

function hasGrant(snapshot, requestedGrant) {
  if (!snapshot?.enabled) return false;
  if (snapshot.grants.includes("*")) return true;
  const requested = canonicalGrant(requestedGrant);
  if (snapshot.grants.includes(requestedGrant) || snapshot.grants.includes(requested)) return true;
  return snapshot.grants.some((grant) => grant.endsWith(".*") && requested.startsWith(grant.slice(0, -1)));
}

function proxyHeaders(req, raw = null) {
  const headers = { ...req.headers, host: `127.0.0.1:${innerPort}` };
  if (raw) headers["content-length"] = String(raw.length);
  return headers;
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

async function proxyIdentity(req, res, id) {
  const response = await fetch(`http://127.0.0.1:${innerPort}${req.url}`, {
    method: req.method,
    headers: proxyHeaders(req),
    signal: AbortSignal.timeout(45000),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(res, response.status, payload || {}, id, passthroughHeaders(response));
  }

  // The legacy inner response base carries the owner GID even for public display state.
  // Never let an unauthenticated display response masquerade as an authenticated GID.
  if (payload.authenticated !== true) {
    payload.gid = null;
    payload.tier = "free";
    payload.subscription_status = "free";
    payload.entitlements = [];
    payload.entitlement_authority = "ARI/Neon";
    return json(res, response.status, payload, id, passthroughHeaders(response));
  }

  const actor = await principal(req).catch(() => null);
  let gid = actor?.gid || payload.gid || payload?.identity?.gid || null;
  if (!gid && actor?.user_id) gid = await resolveGidFromAuthUser(actor.user_id);
  const snapshot = gid ? await entitlementSnapshot(String(gid)) : null;
  if (snapshot) {
    payload.gid = snapshot.gid;
    payload.tier = snapshot.tier;
    payload.subscription_status = snapshot.status;
    payload.entitlements = snapshot.grants;
    payload.entitlement_authority = snapshot.authority;
    payload.entitlement_version = snapshot.version;
  }
  return json(res, response.status, payload, id, passthroughHeaders(response));
}

function proxyStream(req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: innerPort,
      path: req.url,
      method: req.method,
      headers: proxyHeaders(req),
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, "x-entitlement-authority": "neon-v1" });
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    const id = requestId(req);
    json(res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: "ARI universal runtime unavailable", request_id: id }, id);
    console.error("Subscription entitlement gateway upstream error", error);
  });
  req.pipe(upstream);
}

function readBody(req, limit = 256 * 1024) {
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

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    if (req.method === "GET" && pathname === "/api/identity") return await proxyIdentity(req, res, id);

    if (req.method === "GET" && ["/api/subscription", "/api/entitlements"].includes(pathname)) {
      const snapshot = await snapshotForRequest(req);
      if (!snapshot) return json(res, 401, { ok: false, code: "IDENTITY_REQUIRED", error: "Authenticated GID required", request_id: id }, id);
      if (pathname === "/api/subscription") {
        return json(res, 200, {
          ok: true,
          gid: snapshot.gid,
          tier: snapshot.tier,
          internal_tier: snapshot.internal_tier,
          status: snapshot.status,
          version: snapshot.version,
          authority: snapshot.authority,
        }, id);
      }
      return json(res, 200, snapshot, id);
    }

    if (req.method === "POST" && pathname === "/api/authorize") {
      const raw = await readBody(req);
      let body = {};
      try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
      catch { return json(res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body", request_id: id }, id); }
      const grant = String(body.grant || (body.capability && body.operation ? `${body.capability}.${body.operation}` : "")).trim();
      if (!grant) return json(res, 400, { ok: false, code: "GRANT_REQUIRED", error: "grant or capability+operation is required", request_id: id }, id);
      const snapshot = await snapshotForRequest(req);
      if (!snapshot) return json(res, 401, { ok: false, code: "IDENTITY_REQUIRED", error: "Authenticated GID required", request_id: id }, id);
      const allowed = hasGrant(snapshot, grant);
      return json(res, allowed ? 200 : 403, {
        ok: allowed,
        allowed,
        gid: snapshot.gid,
        tier: snapshot.tier,
        grant,
        canonical_grant: canonicalGrant(grant),
        version: snapshot.version,
        authority: snapshot.authority,
        reason: allowed ? "entitled" : "entitlement_required",
      }, id);
    }

    return proxyStream(req, res);
  } catch (error) {
    console.error("Subscription entitlement gateway error", error);
    return json(res, Number(error.status) || 503, {
      ok: false,
      code: error.code || "ENTITLEMENT_AUTHORITY_FAILURE",
      error: error.message || "Entitlement authority failure",
      request_id: id,
    }, id);
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, { timeout = 20000, interval = 100 } = {}) {
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
  .then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`ARI subscription entitlement authority ${outerPort}; universal inner ${innerPort}; matrix=${TOKEN_MATRIX_VERSION}`)))
  .catch((error) => {
    console.error(`ARI universal child failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`Subscription entitlement gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
