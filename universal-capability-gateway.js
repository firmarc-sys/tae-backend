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
const innerPort = Number(process.env.UNIVERSAL_CAPABILITY_INNER_PORT || 8082);
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

function hasBearer(req) {
  return /^Bearer\s+\S+/i.test(String(req.headers.authorization || ""));
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
    "access-control-expose-headers": "x-request-id,x-runtime,x-capability-fabric,x-ratelimit-limit,x-ratelimit-remaining,x-ratelimit-reset,retry-after",
    vary: "Origin",
  };
}

function json(res, status, body, id, req, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-capability-fabric": "universal-v1",
    ...(id ? { "x-request-id": id } : {}),
    ...extraHeaders,
  });
  res.end(data);
}

function readBody(req, limit = 512 * 1024) {
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

function parseJson(raw) {
  try {
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("body must be an object");
    return body;
  } catch (error) {
    throw Object.assign(new Error(error.message === "body must be an object" ? error.message : "Invalid JSON body"), { status: 400, code: "INVALID_JSON" });
  }
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

async function enforcePlanRate(req, res, id) {
  const result = await enforceDistributedRateLimit(db, {
    bucketKey: rateBucket(req),
    routeClass: "capability-planning",
    limit: 60,
    windowSeconds: 60,
  });
  const headers = {
    "x-ratelimit-limit": String(result.limit),
    "x-ratelimit-remaining": String(result.remaining),
    "x-ratelimit-reset": String(result.retryAfter),
  };
  if (!result.allowed) {
    headers["retry-after"] = String(result.retryAfter);
    json(res, 429, { ok: false, code: "RATE_LIMITED", error: "Capability planning rate limit exceeded", request_id: id }, id, req, headers);
    return false;
  }
  req.__capabilityRateHeaders = headers;
  return true;
}

function proxyResponseHeaders(req, upstreamHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(upstreamHeaders || {})) {
    const lower = key.toLowerCase();
    if (lower.startsWith("access-control-") || lower === "content-security-policy" || lower === "strict-transport-security" || lower === "x-frame-options" || lower === "x-content-type-options" || lower === "referrer-policy" || lower === "permissions-policy") continue;
    if (value != null) headers[key] = value;
  }
  return { ...headers, ...SECURITY_HEADERS, ...corsHeaders(req) };
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
    json(res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: "ARI secure runtime unavailable", request_id: id }, id, req);
    console.error("Universal capability gateway upstream error", error);
  });
  req.pipe(upstream);
}

function proxyBuffered(req, res, raw) {
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${innerPort}`,
    "content-length": String(raw.length),
  };
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: innerPort,
      path: req.url,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, proxyResponseHeaders(req, upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    const id = requestId(req);
    json(res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: "ARI secure runtime unavailable", request_id: id }, id, req);
    console.error("Universal capability buffered proxy error", error);
  });
  upstream.end(raw);
}

async function requireExecutionIdentity(req) {
  const gid = sessionGid(req);
  if (gid || hasBearer(req)) return gid;
  throw Object.assign(new Error("Authenticated ARI session required"), { status: 401, code: "AUTH_REQUIRED" });
}

async function requireOwner(req) {
  const gid = sessionGid(req);
  if (gid !== OWNER_GID) throw Object.assign(new Error("Prime Orchestrator session required"), { status: gid ? 403 : 401, code: "OWNER_REQUIRED" });
  return gid;
}

function compactCapabilityContext(catalog) {
  return {
    authority: "ARI",
    schema_version: catalog.schema_version,
    open_ended: true,
    dynamic_discovery: true,
    rule: "Capabilities are execution primitives, not UI navigation. Compose them to satisfy the human goal. If a capability is unavailable, explain the missing authority/connector/device instead of pretending execution succeeded.",
    available: (catalog.capabilities || [])
      .filter((capability) => capability.available)
      .map((capability) => ({
        id: capability.id,
        domain: capability.domain,
        operations: capability.operations,
        side_effect: Boolean(capability.side_effect),
        sources: capability.sources,
        manifestation: capability.manifestation,
      })),
    discoverable_unavailable: (catalog.capabilities || [])
      .filter((capability) => !capability.available)
      .map((capability) => ({ id: capability.id, domain: capability.domain, connectors_required: capability.connectors_required || [] })),
  };
}

async function handleTaeWithCapabilityContext(req, res) {
  const raw = await readBody(req);
  const body = parseJson(raw);
  const gid = sessionGid(req);
  const catalog = await getCapabilityCatalog(db, { gid });
  const capabilityContext = compactCapabilityContext(catalog);
  const enriched = {
    ...body,
    context: {
      ...(body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context : {}),
      capability_fabric: capabilityContext,
    },
    capability_fabric: capabilityContext,
  };
  return proxyBuffered(req, res, Buffer.from(JSON.stringify(enriched)));
}

async function handleCapabilityRoute(req, res, pathname, id) {
  const gid = sessionGid(req);

  if (req.method === "GET" && pathname === "/api/capabilities") {
    const catalog = await getCapabilityCatalog(db, { gid });
    return json(res, 200, { ok: true, ...catalog }, id, req);
  }

  if (req.method === "POST" && pathname === "/api/capabilities/plan") {
    const authenticatedGid = await requireExecutionIdentity(req);
    if (!(await enforcePlanRate(req, res, id))) return;
    const raw = await readBody(req);
    const body = parseJson(raw);
    const catalog = await getCapabilityCatalog(db, { gid: authenticatedGid });
    const graph = compileExecutionGraph({
      goal: body.goal || body.intent || body.prompt,
      catalog,
      requestedCapabilities: body.requested_capabilities || body.capabilities || [],
    });
    await persistExecutionGraph(db, { gid: authenticatedGid, graph });
    return json(res, 200, {
      ok: true,
      authority: "ARI",
      planner: "JAHORIN_CAPABILITY_FABRIC",
      graph,
    }, id, req, req.__capabilityRateHeaders || {});
  }

  const graphMatch = pathname.match(/^\/api\/capabilities\/graphs\/([0-9a-f-]{36})$/i);
  if (req.method === "GET" && graphMatch) {
    const authenticatedGid = await requireExecutionIdentity(req);
    const graph = await getExecutionGraph(db, { gid: authenticatedGid, graphId: graphMatch[1] });
    if (!graph) return json(res, 404, { ok: false, code: "GRAPH_NOT_FOUND", error: "Execution graph not found", request_id: id }, id, req);
    return json(res, 200, { ok: true, execution_graph: graph }, id, req);
  }

  if (pathname === "/api/control/capabilities") {
    await requireOwner(req);
    if (req.method === "GET") {
      const catalog = await getCapabilityCatalog(db, { gid: OWNER_GID });
      return json(res, 200, { ok: true, ...catalog }, id, req);
    }
    if (req.method === "POST") {
      const body = parseJson(await readBody(req));
      const capability = await registerCapability(db, body);
      return json(res, 200, { ok: true, capability }, id, req);
    }
  }

  return json(res, 404, { ok: false, code: "CAPABILITY_ROUTE_NOT_FOUND", error: "Capability route not found", request_id: id }, id, req);
}

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const origin = originFor(req);
    if (origin === false) {
      return json(res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed", request_id: id }, id, req);
    }

    if (req.method === "OPTIONS" && (pathname.startsWith("/api/capabilities") || pathname === "/api/control/capabilities")) {
      res.writeHead(204, {
        ...SECURITY_HEADERS,
        ...corsHeaders(req),
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization,x-request-id",
        "access-control-max-age": "600",
      });
      return res.end();
    }

    if (pathname.startsWith("/api/capabilities") || pathname === "/api/control/capabilities") {
      return await handleCapabilityRoute(req, res, pathname, id);
    }

    if (req.method === "POST" && pathname === "/api/tae") {
      return await handleTaeWithCapabilityContext(req, res);
    }

    return proxyStream(req, res);
  } catch (error) {
    const status = Number(error?.status) || 503;
    const code = String(error?.code || (status >= 500 ? "SYSTEM_FAILURE" : "REQUEST_DENIED"));
    if (status >= 500) console.error("Universal capability gateway error", error);
    return json(res, status, { ok: false, code, error: error?.message || "Capability fabric failure", request_id: id }, id, req, req.__capabilityRateHeaders || {});
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

Promise.all([ensureCapabilityFabricSchema(db), waitForPort(innerPort)])
  .then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`Jahorin universal capability gateway ${outerPort}; hardened ARI ${innerPort}; open-ended capability discovery ready`)))
  .catch((error) => {
    console.error(`Universal capability gateway failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`Universal capability gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
