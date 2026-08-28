import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  resolveRuntimeAuthorization,
  recordRuntimeAuthorizationEvent,
} from "./neon-store.js";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.AUTHORIZATION_GATEWAY_INNER_PORT || 8092);
const SESSION_COOKIE = "ari_session";
const OWNER_GID = String(process.env.SIOS_OWNER_GID || "399152573423");
const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");

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
let recentChildOutput = [];
function rememberChildOutput(source, chunk) {
  const text = String(chunk || "").trim();
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    recentChildOutput.push(`${source}: ${line}`);
    if (recentChildOutput.length > 80) recentChildOutput.shift();
  }
  console.log(`[production-child:${source}] ${text}`);
}

const child = spawn(process.execPath, ["production-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout?.on("data", (chunk) => rememberChildOutput("stdout", chunk));
child.stderr?.on("data", (chunk) => rememberChildOutput("stderr", chunk));
child.on("error", (error) => rememberChildOutput("spawn", error?.stack || error?.message || error));
child.on("exit", (code, signal) => {
  childReady = false;
  childExit = { code, signal: signal || null, at: new Date().toISOString() };
  rememberChildOutput("exit", `code=${code} signal=${signal || ""}`);
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
    vary: "Origin",
  };
}

function json(req, res, status, body) {
  const id = requestId(req);
  const data = Buffer.from(JSON.stringify({ ...body, request_id: body?.request_id || id }));
  res.writeHead(status, {
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-authorization-authority": "gid-neon-v1",
    "x-request-id": id,
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  });
  res.end(data);
}

function canonicalCapability(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return ({
    wepwawet: "interweb",
    interweb: "interweb",
    hathor: "augment",
    syncori: "augment",
    augment: "augment",
    ptah: "code",
    code: "code",
    thoth: "scribe",
    chat: "scribe",
    scribe: "scribe",
    horus: "optics",
    optics: "optics",
    novalife: "novalife",
    stare: "stare",
    gid: "gid",
    eden: "eden",
    nsos: "nsos",
    heros: "nsos",
  })[raw] || raw;
}

function canonicalOperation(capability, body = {}) {
  const raw = String(body.operation || body?.payload?.action || body?.payload?.operation || "").trim().toLowerCase();
  const normalized = raw.replace(/-/g, "_");
  const aliases = {
    image_generate: "image.generate",
    video_generate: "video.generate",
    document_create: "document.create",
    audio_generate: "audio.generate",
    music_generate: "music.generate",
  };
  if (aliases[normalized]) return aliases[normalized];
  if (raw) return raw;
  return ({
    interweb: "search",
    augment: "generate",
    code: "generate",
    scribe: "write",
    optics: "analyze",
    novalife: "execute",
    stare: "execute",
    gid: "read",
    eden: "execute",
    nsos: "read",
  })[capability] || "execute";
}

function readBody(req, limit = 1024 * 1024) {
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
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: proxyHeaders(req, raw),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: error.message }));
  upstream.end(raw);
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
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: error.message }));
  req.pipe(upstream);
}

async function authorizeRuntime(req, res) {
  const id = requestId(req);
  const raw = await readBody(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
  catch { return json(req, res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body", request_id: id }); }

  const gid = sessionGid(req);
  if (!gid) {
    return json(req, res, 401, { ok: false, code: "AUTH_REQUIRED", error: "Authenticated GID required", authorization: { result: "deny" }, request_id: id });
  }

  const capability = canonicalCapability(body.capability || body?.payload?.capability || "");
  const operation = canonicalOperation(capability, body);
  const authorization = await resolveRuntimeAuthorization(gid, capability, operation);

  await recordRuntimeAuthorizationEvent({
    request_id: body.request_id || id,
    gid,
    user_type: authorization.user_type,
    role_id: authorization.role_id,
    tier_id: authorization.tier_id,
    capability_id: capability,
    operation,
    authorization_result: authorization.allowed ? "allow" : "deny",
    reason_code: authorization.reason_code,
    latency_ms: authorization.latency_ms,
    metadata: { source: "authorization-gateway", owner: gid === OWNER_GID },
  }).catch((error) => console.error("authorization audit record failed", error));

  if (!authorization.allowed) {
    const code = authorization.reason_code || "ENTITLEMENT_REQUIRED";
    return json(req, res, code === "USAGE_LIMIT_REACHED" ? 429 : 403, {
      ok: false,
      code,
      error: code === "USAGE_LIMIT_REACHED" ? "Usage limit reached" : "Capability entitlement required",
      authorization: { result: "deny", ...authorization },
      request_id: body.request_id || id,
    });
  }

  return proxyBuffered(req, res, raw);
}

async function handle(req, res) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const origin = originFor(req);
    if (origin === false) return json(req, res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" });

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...corsHeaders(req), "access-control-max-age": "600" });
      return res.end();
    }

    if (pathname === "/api/edge-diagnostics") {
      return json(req, res, childReady ? 200 : 503, {
        ok: childReady,
        edge_listening: true,
        inner_port: innerPort,
        child_ready: childReady,
        child_exit: childExit,
        child_output: recentChildOutput.slice(-40),
      });
    }

    if (pathname === "/api/ready" && !childReady) {
      return json(req, res, 503, {
        ok: false,
        code: "INNER_CHAIN_NOT_READY",
        edge_listening: true,
        inner_port: innerPort,
        child_ready: false,
        child_exit: childExit,
        child_output: recentChildOutput.slice(-40),
      });
    }

    if (req.method === "POST" && (pathname === "/api/runtime" || pathname === "/runtime")) {
      return await authorizeRuntime(req, res);
    }

    if (!childReady) {
      return json(req, res, 503, {
        ok: false,
        code: "INNER_CHAIN_NOT_READY",
        error: "ARI inner production chain is not ready",
        child_exit: childExit,
      });
    }

    return proxyStream(req, res);
  } catch (error) {
    console.error("ARI authorization gateway error", error);
    return json(req, res, Number(error.status) || 503, {
      ok: false,
      code: error.code || "AUTHORIZATION_FAILURE",
      error: error.message || "Authorization failure",
    });
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

function waitForPort(port, { timeout = 30000, interval = 120 } = {}) {
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
  console.log(`ARI GID authorization edge listening on ${outerPort}; awaiting production inner ${innerPort}`);
});

waitForPort(innerPort)
  .then(() => {
    childReady = true;
    console.log(`ARI production inner chain ready on ${innerPort}`);
  })
  .catch((error) => {
    childReady = false;
    rememberChildOutput("readiness", `production child failed readiness: ${error.message}`);
  });

function shutdown(signal) {
  console.log(`ARI authorization gateway received ${signal}`);
  gateway.close(() => {
    if (!child.killed) child.kill("SIGTERM");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
