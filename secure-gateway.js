import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import {
  ensureDeviceFabricSchema,
  enforceDistributedRateLimit,
  handleDeviceRoute,
  isDeviceRoute,
} from "./device-fabric.js";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.SECURE_GATEWAY_INNER_PORT || 8086);
const SESSION_COOKIE = "ari_session";
const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const authRequired = !/^(0|false|no|off)$/i.test(process.env.ARI_REQUIRE_AUTH || "true");
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

const child = spawn(process.execPath, ["control-plane-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI control-plane gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function requestId(req) {
  return String(req.headers["x-request-id"] || crypto.randomUUID());
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

function hasExecutionAuthMaterial(req) {
  if (sessionGid(req)) return true;
  return /^Bearer\s+\S+/i.test(String(req.headers.authorization || ""));
}

function requiresExecutionAuth(pathname, method) {
  if (String(method || "GET").toUpperCase() !== "POST") return false;
  return new Set(["/api/runtime", "/runtime", "/api/tae", "/tae", "/api/generate", "/generate"]).has(pathname);
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
    "access-control-expose-headers": "x-request-id,x-runtime,x-control-plane,x-ratelimit-limit,x-ratelimit-remaining,x-ratelimit-reset,retry-after",
    vary: "Origin",
  };
}

function json(res, status, body, id, extraHeaders = {}, req = null) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(req ? corsHeaders(req) : {}),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-security-boundary": "hardened",
    ...(id ? { "x-request-id": id } : {}),
    ...extraHeaders,
  });
  res.end(data);
}

function readBody(req, limit = 256 * 1024) {
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

function clientAddress(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function rateBucket(req) {
  const gid = sessionGid(req);
  if (gid) return `gid:${gid}`;
  return `ip:${crypto.createHash("sha256").update(clientAddress(req)).digest("hex").slice(0, 32)}`;
}

function rateClass(pathname, method) {
  if (method === "POST" && pathname === "/api/identity/guest") return { name: "identity-enrollment", limit: 12 };
  if (method === "POST" && pathname === "/api/devices/enroll/start") return { name: "device-enrollment", limit: 12 };
  if (method === "POST" && pathname === "/api/devices/enroll/verify") return { name: "device-verification", limit: 20 };
  if (pathname.startsWith("/api/devices/") && method !== "GET") return { name: "device-mutation", limit: 60 };
  if (method === "POST" && pathname === "/api/tae") return { name: "tae-generation", limit: 60 };
  if (method === "POST" && pathname === "/api/runtime") return { name: "runtime-execution", limit: 90 };
  if (pathname.startsWith("/api/billing/") && method !== "GET") return { name: "billing-mutation", limit: 30 };
  return null;
}

async function enforceRequestRate(req, res, pathname, id) {
  const rule = rateClass(pathname, req.method || "GET");
  if (!rule) return true;
  const result = await enforceDistributedRateLimit(db, {
    bucketKey: rateBucket(req),
    routeClass: rule.name,
    limit: rule.limit,
    windowSeconds: 60,
  });
  const headers = {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.retryAfter),
  };
  if (!result.allowed) {
    headers["retry-after"] = String(result.retryAfter);
    json(res, 429, { ok: false, status: "denied", code: "RATE_LIMITED", error: "Request rate limit exceeded", request_id: id }, id, headers, req);
    return false;
  }
  req.__ariRateHeaders = headers;
  return true;
}

function proxyResponseHeaders(req, upstreamHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(upstreamHeaders || {})) {
    const lower = key.toLowerCase();
    if (lower.startsWith("access-control-") || lower === "content-security-policy" || lower === "strict-transport-security" || lower === "x-frame-options" || lower === "x-content-type-options" || lower === "referrer-policy" || lower === "permissions-policy") continue;
    if (value != null) headers[key] = value;
  }
  return { ...headers, ...SECURITY_HEADERS, ...corsHeaders(req), ...(req.__ariRateHeaders || {}) };
}

function proxyStream(req, res) {
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: innerPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${innerPort}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, proxyResponseHeaders(req, upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    const id = requestId(req);
    json(res, 503, { ok: false, status: "failed", code: "RUNTIME_UNAVAILABLE", error: "ARI runtime unavailable", request_id: id }, id, {}, req);
    console.error("Secure gateway upstream error", error);
  });
  req.pipe(upstream);
}

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const origin = originFor(req);
    if (origin === false) {
      return json(res, 403, { ok: false, status: "denied", code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed", request_id: id }, id, {}, req);
    }
    if (req.method === "OPTIONS") {
      const headers = {
        ...SECURITY_HEADERS,
        ...corsHeaders(req),
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type,authorization,x-request-id,x-device-id,x-device-timestamp,x-device-nonce,x-device-signature",
        "access-control-max-age": "600",
      };
      res.writeHead(204, headers);
      return res.end();
    }

    if (authRequired && requiresExecutionAuth(pathname, req.method) && !hasExecutionAuthMaterial(req)) {
      return json(res, 401, { ok: false, status: "denied", code: "AUTH_REQUIRED", error: "Authenticated ARI session required", request_id: id }, id, {}, req);
    }

    if (!(await enforceRequestRate(req, res, pathname, id))) return;

    if (isDeviceRoute(pathname)) {
      const raw = ["GET", "HEAD"].includes(req.method || "GET") ? Buffer.alloc(0) : await readBody(req);
      const deviceJson = (response, status, body, requestIdValue, headers = {}) => json(response, status, body, requestIdValue, { ...(req.__ariRateHeaders || {}), ...headers }, req);
      return await handleDeviceRoute({ req, res, raw, pathname, id, db, sessionGid, json: deviceJson });
    }

    return proxyStream(req, res);
  } catch (error) {
    const status = Number(error?.status) || 503;
    const code = String(error?.code || (status >= 500 ? "SYSTEM_FAILURE" : "REQUEST_DENIED"));
    if (status >= 500) console.error("Jahorin secure gateway error", error);
    return json(res, status, { ok: false, status: status >= 500 ? "failed" : "denied", code, error: error?.message || "Secure gateway failure", request_id: id }, id, req.__ariRateHeaders || {}, req);
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, { timeout = 20000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", (error) => { socket.destroy(); if (Date.now() >= deadline) reject(error); else setTimeout(attempt, interval); });
    };
    attempt();
  });
}

Promise.all([ensureDeviceFabricSchema(db), waitForPort(innerPort)])
  .then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`Jahorin hardened ARI edge ${outerPort}; control plane ${innerPort}; device fabric ready`)))
  .catch((error) => {
    console.error(`ARI hardened gateway failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`Jahorin hardened gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
