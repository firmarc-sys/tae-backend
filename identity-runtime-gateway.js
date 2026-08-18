import "dotenv/config";
import http from "node:http";
import { spawn } from "node:child_process";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.ARI_INNER_PORT || 8081);
const innerBase = `http://127.0.0.1:${innerPort}`;

const child = spawn(process.execPath, ["server.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  console.error(`ARI inner server exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function json(res, status, body, requestId) {
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

function readBody(req, limit = 2 * 1024 * 1024) {
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

function actionFrom(body) {
  const raw = body?.payload?.action ?? body?.action ?? body?.intent ?? "";
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function innerJson(path, { method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${innerBase}${path}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

function authHeaders(req, payload = {}) {
  const headers = {};
  const incomingAuth = req.headers.authorization;
  const explicitToken = payload?.access_token || payload?.accessToken || payload?.session?.access_token;
  if (explicitToken) headers.authorization = `Bearer ${String(explicitToken).replace(/^Bearer\s+/i, "")}`;
  else if (incomingAuth) headers.authorization = incomingAuth;
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.origin) headers.origin = req.headers.origin;
  if (req.headers["x-request-id"]) headers["x-request-id"] = req.headers["x-request-id"];
  return headers;
}

async function handleCreateGid(req, res, body, requestId) {
  const payload = body?.payload || {};
  const email = String(payload.email || body?.email || "").trim().toLowerCase();
  const password = String(payload.password || body?.password || "");
  const displayName = String(payload.display_name || payload.displayName || body?.display_name || "").trim();

  if (!email || !password) {
    return json(res, 400, {
      ok: false,
      capability: "identity",
      action: "create_gid",
      code: "signup_fields_required",
      error: "email and password are required to create a persistent GID",
      required: ["email", "password"],
      request_id: requestId,
    }, requestId);
  }

  const { response, payload: signup } = await innerJson("/api/auth/signup", {
    method: "POST",
    body: { email, password, ...(displayName ? { display_name: displayName } : {}) },
    headers: req.headers.origin ? { origin: req.headers.origin } : {},
  });

  if (!response.ok) {
    return json(res, response.status, {
      ok: false,
      capability: "identity",
      action: "create_gid",
      error: signup?.error || signup?.message || "GID creation failed",
      details: signup,
      request_id: requestId,
    }, requestId);
  }

  const user = signup?.user || null;
  const gid = user?.user_metadata?.gid || signup?.gid || null;
  const session = signup?.access_token ? {
    access_token: signup.access_token,
    refresh_token: signup.refresh_token || null,
    expires_in: signup.expires_in || null,
    token_type: "bearer",
  } : null;

  return json(res, 201, {
    ok: true,
    capability: "identity",
    action: "create_gid",
    request_id: requestId,
    result: {
      gid,
      authenticated: Boolean(signup?.access_token),
      confirmation_required: Boolean(signup?.confirmation_required),
      user: user ? {
        id: user.id || null,
        email: user.email || email,
        display_name: user.user_metadata?.display_name || displayName || null,
      } : { email, display_name: displayName || null },
      session,
      tier: signup?.tier || "free",
      entitlements: signup?.entitlements || [],
      next: signup?.confirmation_required ? "confirm_email" : "enter_trismegistus",
    },
    gid,
    session,
    tier: signup?.tier || "free",
    entitlements: signup?.entitlements || [],
  }, requestId);
}

async function handleSubscribe(req, res, body, requestId) {
  const payload = body?.payload || {};
  const tier = String(payload.tier || payload.plan || body?.tier || body?.plan || "beta").trim().toLowerCase();
  if (!["beta", "alpha"].includes(tier)) {
    return json(res, 400, {
      ok: false,
      capability: "identity",
      action: "subscribe",
      error: "tier must be beta or alpha",
      allowed_tiers: ["beta", "alpha"],
      request_id: requestId,
    }, requestId);
  }

  const headers = authHeaders(req, payload);
  const { response, payload: checkout } = await innerJson("/api/billing/checkout", {
    method: "POST",
    body: { tier },
    headers,
  });

  if (!response.ok) {
    if (response.status === 409) {
      const status = await innerJson("/api/billing/status", { headers });
      if (status.response.ok) {
        return json(res, 200, {
          ok: true,
          capability: "identity",
          action: "subscribe",
          request_id: requestId,
          result: {
            checkout_required: false,
            subscription: status.payload?.subscription || null,
            tier: status.payload?.tier || tier,
            status: status.payload?.status || "active",
            entitlements: status.payload?.entitlements || [],
          },
          subscription: status.payload?.subscription || null,
          tier: status.payload?.tier || tier,
          subscription_status: status.payload?.status || "active",
          entitlements: status.payload?.entitlements || [],
        }, requestId);
      }
    }
    return json(res, response.status, {
      ok: false,
      capability: "identity",
      action: "subscribe",
      error: checkout?.error || checkout?.message || "Subscription checkout failed",
      details: checkout,
      request_id: requestId,
    }, requestId);
  }

  const checkoutUrl = checkout?.url || checkout?.checkout_url || null;
  return json(res, 200, {
    ok: true,
    capability: "identity",
    action: "subscribe",
    request_id: requestId,
    result: {
      checkout_required: true,
      checkout_url: checkoutUrl,
      session_id: checkout?.session_id || null,
      tier: checkout?.tier || tier,
      status: "checkout_pending",
    },
    checkout_url: checkoutUrl,
    url: checkoutUrl,
    session_id: checkout?.session_id || null,
    tier: checkout?.tier || tier,
    subscription_status: "checkout_pending",
  }, requestId);
}

async function handleSubscriptionStatus(req, res, body, requestId) {
  const payload = body?.payload || {};
  const { response, payload: status } = await innerJson("/api/billing/status", {
    headers: authHeaders(req, payload),
  });
  return json(res, response.status, response.ok ? {
    ok: true,
    capability: "identity",
    action: "subscription_status",
    request_id: requestId,
    result: {
      tier: status?.tier || "free",
      status: status?.status || "active",
      subscription: status?.subscription || null,
      entitlements: status?.entitlements || [],
    },
    tier: status?.tier || "free",
    subscription_status: status?.status || "active",
    subscription: status?.subscription || null,
    entitlements: status?.entitlements || [],
  } : {
    ok: false,
    capability: "identity",
    action: "subscription_status",
    request_id: requestId,
    error: status?.error || status?.message || "Subscription status unavailable",
  }, requestId);
}

async function interceptRuntimeIdentity(req, res) {
  const requestId = String(req.headers["x-request-id"] || crypto.randomUUID());
  let body;
  try {
    const raw = await readBody(req);
    body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
  } catch (error) {
    return json(res, error.status || 400, { ok: false, error: error.message || "invalid JSON", request_id: requestId }, requestId);
  }

  const capability = String(body?.capability || "").trim().toLowerCase();
  if (capability !== "identity") return proxyBuffered(req, res, body, requestId);

  const action = actionFrom(body);
  try {
    if (["create_gid", "create_g_id", "signup", "sign_up", "register"].includes(action)) {
      return await handleCreateGid(req, res, body, requestId);
    }
    if (["subscribe", "subscription", "checkout", "start_subscription"].includes(action)) {
      return await handleSubscribe(req, res, body, requestId);
    }
    if (["subscription_status", "billing_status", "status"].includes(action)) {
      return await handleSubscriptionStatus(req, res, body, requestId);
    }
    return proxyBuffered(req, res, body, requestId);
  } catch (error) {
    console.error("ARI identity runtime action failed", error);
    return json(res, Number(error.status) || 502, {
      ok: false,
      capability: "identity",
      action,
      error: error.message || "Identity runtime action failed",
      request_id: requestId,
    }, requestId);
  }
}

function proxyBuffered(req, res, body, requestId) {
  const encoded = Buffer.from(JSON.stringify(body || {}));
  const options = {
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${innerPort}`,
      "content-length": String(encoded.length),
      "x-request-id": requestId,
    },
  };
  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(res, 503, { ok: false, error: `ARI inner server unavailable: ${error.message}`, request_id: requestId }, requestId));
  upstream.end(encoded);
}

function proxyStream(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${innerPort}` },
  };
  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(res, 503, { ok: false, error: `ARI inner server unavailable: ${error.message}` }));
  req.pipe(upstream);
}

const gateway = http.createServer((req, res) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const isRuntime = req.method === "POST" && (pathname === "/api/runtime" || pathname === "/runtime");
  if (isRuntime) return void interceptRuntimeIdentity(req, res);
  return proxyStream(req, res);
});

gateway.listen(outerPort, "0.0.0.0", () => {
  console.log(`ARI identity runtime gateway listening on ${outerPort}; inner ARI on ${innerPort}`);
});

function shutdown(signal) {
  console.log(`ARI identity runtime gateway received ${signal}`);
  gateway.close(() => {
    if (!child.killed) child.kill("SIGTERM");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
