import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  UAE_GOVERNANCE_VERSION,
  evaluateUaeGovernance,
  publicGovernanceManifest,
} from "./uae-governance.js";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.GOVERNANCE_GATEWAY_INNER_PORT || 8093);
const SESSION_COOKIE = "ari_session";
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

function securityHeaders() {
  return {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  };
}

function json(req, res, status, body) {
  const id = requestId(req);
  const data = Buffer.from(JSON.stringify({ ...body, request_id: body?.request_id || id }));
  res.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(req),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-uae-governance": UAE_GOVERNANCE_VERSION,
    "x-request-id": id,
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
    tae: "tae",
    timeline: "timeline",
    iot: "iot",
    automation: "automation",
    deploy: "deploy",
    novafin: "novafin",
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
    tae: "execute",
    timeline: "read",
    iot: "execute",
    automation: "execute",
    deploy: "deploy",
    novafin: "read",
  })[capability] || "execute";
}

async function readRawBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request body too large"), { status: 413, code: "PAYLOAD_TOO_LARGE" });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function trustedProxyHeaders(req, raw = null, governance = null) {
  const headers = { ...req.headers, host: `127.0.0.1:${innerPort}` };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase().startsWith("x-uae-")) delete headers[key];
  }
  if (raw) headers["content-length"] = String(raw.length);
  if (governance) {
    headers["x-uae-governance-version"] = UAE_GOVERNANCE_VERSION;
    headers["x-uae-governance-decision"] = governance.allowed ? "allow" : "deny";
    headers["x-uae-governance-agent"] = governance.requested_agent || governance?.jurisdiction?.primary || "";
    headers["x-uae-governance-risk"] = governance.risk || "unknown";
    headers["x-uae-human-confirmed"] = governance.human_confirmed ? "true" : "false";
  }
  return headers;
}

function proxyBuffered(req, res, raw, governance = null) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: trustedProxyHeaders(req, raw, governance),
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
    headers: trustedProxyHeaders(req),
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(req, res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: error.message }));
  req.pipe(upstream);
}

function auditGovernance(decision) {
  console.log(JSON.stringify({
    event: "uae_governance_decision",
    at: new Date().toISOString(),
    ...decision,
  }));
}

async function evaluateRuntime(req, res, { execute }) {
  const id = requestId(req);
  const raw = await readRawBody(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
  catch { return json(req, res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body", request_id: id }); }

  const gid = sessionGid(req);
  if (!gid) {
    return json(req, res, 401, {
      ok: false,
      code: "AUTH_REQUIRED",
      error: "Authenticated GID required",
      governance: { result: "deny", version: UAE_GOVERNANCE_VERSION },
      request_id: id,
    });
  }

  const capability = canonicalCapability(body.capability || body?.payload?.capability || "");
  const operation = canonicalOperation(capability, body);
  const governance = evaluateUaeGovernance({
    gid,
    capability,
    operation,
    body,
    requestId: body.request_id || id,
  });
  auditGovernance(governance);

  if (!governance.allowed) {
    const status = governance.reason_code === "HUMAN_CONFIRMATION_REQUIRED" ? 428 : 403;
    return json(req, res, status, {
      ok: false,
      code: governance.reason_code,
      error: governance.reason_code === "HUMAN_CONFIRMATION_REQUIRED"
        ? "Explicit human confirmation is required before this action can execute"
        : "UAE governance denied this action",
      governance: { result: "deny", ...governance },
      request_id: body.request_id || id,
    });
  }

  if (!execute) {
    return json(req, res, 200, {
      ok: true,
      governance: { result: "allow", ...governance },
      request_id: body.request_id || id,
    });
  }

  return proxyBuffered(req, res, raw, governance);
}

async function handle(req, res) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    if (originFor(req) === false) return json(req, res, 403, { ok: false, code: "ORIGIN_NOT_ALLOWED", error: "Origin not allowed" });

    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...corsHeaders(req), ...securityHeaders(), "access-control-max-age": "600" });
      return res.end();
    }

    if (req.method === "GET" && (pathname === "/api/governance" || pathname === "/api/uae/governance")) {
      return json(req, res, 200, publicGovernanceManifest());
    }

    if (pathname === "/api/governance-edge") {
      return json(req, res, childReady ? 200 : 503, {
        ok: childReady,
        governance: UAE_GOVERNANCE_VERSION,
        child_ready: childReady,
        child_exit: childExit,
      });
    }

    if (req.method === "POST" && (pathname === "/api/governance/evaluate" || pathname === "/api/uae/governance/evaluate")) {
      return await evaluateRuntime(req, res, { execute: false });
    }

    if (req.method === "POST" && (pathname === "/api/runtime" || pathname === "/runtime")) {
      return await evaluateRuntime(req, res, { execute: true });
    }

    if (!childReady) {
      return json(req, res, 503, {
        ok: false,
        code: "INNER_CHAIN_NOT_READY",
        error: "ARI authorization chain is not ready",
        child_exit: childExit,
      });
    }

    return proxyStream(req, res);
  } catch (error) {
    console.error("ARI UAE governance gateway error", error);
    return json(req, res, Number(error.status) || 503, {
      ok: false,
      code: error.code || "GOVERNANCE_FAILURE",
      error: error.message || "UAE governance failure",
    });
  }
}

const gateway = http.createServer((req, res) => void handle(req, res));

gateway.listen(outerPort, "0.0.0.0", () => {
  console.log(`ARI UAE governance edge listening on ${outerPort}; awaiting authorization inner ${innerPort}`);
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

waitForPort(innerPort)
  .then(() => {
    childReady = true;
    console.log(`ARI authorization inner chain reachable on ${innerPort}`);
  })
  .catch((error) => {
    childReady = false;
    childExit = { code: null, signal: null, at: new Date().toISOString(), error: error.message };
    console.error(`ARI UAE governance readiness failed: ${error.message}`);
  });

function shutdown(signal) {
  console.log(`ARI UAE governance gateway received ${signal}`);
  gateway.close(() => {
    if (!child.killed) child.kill("SIGTERM");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
