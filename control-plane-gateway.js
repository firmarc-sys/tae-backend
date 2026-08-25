import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import Stripe from "stripe";
import { Pool } from "pg";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.CONTROL_PLANE_INNER_PORT || 8084);
const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const SESSION_COOKIE = "ari_session";

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString ? new Pool({ connectionString, max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 }) : null;
const db = () => {
  if (!pool) throw Object.assign(new Error("Neon is not configured on ARI"), { status: 503 });
  return pool;
};

const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.VERTEX_PROJECT || "689058655022";
const runtimeProvider = geminiApiKey ? "google-gemini-api" : vertexProject ? "google-vertex-ai" : "unconfigured";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const PUBLIC_DOMAIN = (process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://siaas.space").replace(/\/$/, "");
const PRICE_BY_TIER = Object.freeze({
  personal: process.env.STRIPE_PRICE_PERSONAL || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  business: process.env.STRIPE_PRICE_BUSINESS || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
});
const PAID_TIERS = new Set(Object.keys(PRICE_BY_TIER));
const EXTERNAL_TIERS = new Set(["trial", ...PAID_TIERS]);

const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

const child = spawn(process.execPath, ["neon-runtime-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI Neon gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

const requestId = (req) => String(req.headers["x-request-id"] || crypto.randomUUID());
function json(res, status, body, id, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(data.length),
    "cache-control": "no-store",
    "x-runtime": "ARI",
    "x-control-plane": "JAHORIN",
    ...(id ? { "x-request-id": id } : {}),
    ...headers,
  });
  res.end(data);
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const i = part.indexOf("=");
    return i === -1 ? [decodeURIComponent(part), ""] : [decodeURIComponent(part.slice(0, i)), decodeURIComponent(part.slice(i + 1))];
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
  if (!gid || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}
function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
async function requireOwner(req) {
  const gid = sessionGid(req);
  if (gid !== OWNER_GID) throw Object.assign(new Error("Prime Orchestrator session required"), { status: gid ? 403 : 401 });
  return gid;
}
async function memberPrincipal(req) {
  if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error("Member authentication is not configured"), { status: 503 });
  const token = bearerToken(req);
  if (!token) throw Object.assign(new Error("Member authentication required"), { status: 401 });
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw Object.assign(new Error("Invalid member authentication"), { status: 401 });
  return { id: user.id, email: user.email || null, gid: user.user_metadata?.gid ? String(user.user_metadata.gid) : null };
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
function proxyHeaders(req, raw = null) {
  const headers = { ...req.headers, host: `127.0.0.1:${innerPort}` };
  if (raw) headers["content-length"] = String(raw.length);
  return headers;
}
async function innerJson(req, raw = null) {
  const response = await fetch(`http://127.0.0.1:${innerPort}${req.url}`, {
    method: req.method,
    headers: proxyHeaders(req, raw),
    body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : raw,
    signal: AbortSignal.timeout(60000),
    redirect: "manual",
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
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
  const upstream = http.request({ hostname: "127.0.0.1", port: innerPort, path: req.url, method: req.method, headers: proxyHeaders(req) }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, { ...upstreamRes.headers, "x-control-plane": "JAHORIN" });
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => json(res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: error.message }, requestId(req)));
  req.pipe(upstream);
}

function canonicalCapability(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  return ({ wepwawet: "interweb", interweb: "interweb", hathor: "augment", syncori: "augment", augment: "augment", ptah: "code", code: "code", thoth: "scribe", chat: "scribe", scribe: "scribe", horus: "optics", optics: "optics" })[raw] || raw;
}
function canonicalOperation(capability, body = {}) {
  const raw = String(body.operation || body?.payload?.action || body?.payload?.operation || "").trim().toLowerCase();
  const normalized = raw.replace(/-/g, "_");
  const aliases = { image_generate: "image.generate", video_generate: "video.generate", document_create: "document.create" };
  if (aliases[normalized]) return aliases[normalized];
  if (raw) return raw;
  return ({ interweb: "search", augment: "generate", code: "generate", scribe: "write", optics: "analyze" })[capability] || "execute";
}
function providerAvailable(name) {
  if (name === "google-vertex-ai") return Boolean(vertexProject);
  if (name === "google-gemini-api") return Boolean(geminiApiKey);
  return false;
}
async function resolveProviderRoute(capability, operation) {
  const result = await db().query(`select id,capability_id,operation,provider,model_alias,fallback_alias,priority,enabled,config from public.provider_routes where capability_id=$1 and operation=$2 and enabled=true order by priority desc,id asc`, [capability, operation]);
  if (!result.rows.length) return null;
  const primary = result.rows[0];
  if (providerAvailable(primary.provider) && primary.provider === runtimeProvider) return primary;
  if (primary.fallback_alias) {
    const fallback = await db().query(`select id,capability_id,operation,provider,model_alias,fallback_alias,priority,enabled,config from public.provider_routes where capability_id=$1 and operation=$2 and model_alias=$3 and enabled=true order by priority desc,id asc limit 1`, [capability, operation, primary.fallback_alias]);
    const row = fallback.rows[0];
    if (row && providerAvailable(row.provider) && row.provider === runtimeProvider) return row;
  }
  return result.rows.find((row) => row.provider === runtimeProvider && providerAvailable(row.provider)) || primary;
}
async function handleRuntime(req, res, raw, id) {
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return json(res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body", request_id: id }, id); }
  const capability = canonicalCapability(body.capability || body?.payload?.capability || "");
  const operation = canonicalOperation(capability, body);
  const route = await resolveProviderRoute(capability, operation);
  if (!route) return json(res, 503, { ok: false, code: "PROVIDER_UNAVAILABLE", error: `No enabled provider route for ${capability}.${operation}`, request_id: body.request_id || id }, id);
  if (!providerAvailable(route.provider) || route.provider !== runtimeProvider) {
    return json(res, 503, { ok: false, code: "PROVIDER_UNAVAILABLE", error: `Registry selected ${route.provider}, but that provider is not active on this ARI revision`, request_id: body.request_id || id, provider_route: { capability: route.capability_id, operation: route.operation, provider: route.provider, model_alias: route.model_alias, fallback_alias: route.fallback_alias } }, id);
  }
  const { response, payload } = await innerJson(req, raw);
  const reportedProvider = payload?.provider?.name || payload?.result?.provider || (typeof payload?.provider === "string" ? payload.provider : null);
  if (response.ok && reportedProvider && reportedProvider !== route.provider) {
    return json(res, 502, { ok: false, code: "PROVIDER_ROUTE_MISMATCH", error: `Runtime returned ${reportedProvider}; registry authorized ${route.provider}`, request_id: body.request_id || id }, id);
  }
  return json(res, response.status, { ...(payload || {}), provider_route: { id: route.id, capability: route.capability_id, operation: route.operation, provider: route.provider, model_alias: route.model_alias, fallback_alias: route.fallback_alias, registry_authority: true } }, id, passthroughHeaders(response));
}

async function recordTaeCommand({ prompt, sourceSurface, state, responsePayload }) {
  const result = await db().query(`insert into public.tae_commands (command_text,normalized_route,source_surface,execution_state,response_payload) values ($1,'tae',$2,$3,$4::jsonb) returning id,command_text,normalized_route,source_surface,execution_state,created_at`, [prompt, sourceSurface || "mercury", state, JSON.stringify(responsePayload || {})]);
  return result.rows[0] || null;
}
async function handleTae(req, res, raw, id) {
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return json(res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body", request_id: id }, id); }
  const prompt = String(body.prompt || body.command || "").trim();
  if (!prompt) return json(res, 422, { ok: false, error: "prompt is required", request_id: id }, id);
  const { response, payload } = await innerJson(req, raw);
  const command = await recordTaeCommand({ prompt, sourceSurface: body.source_surface || body?.context?.surface || "mercury", state: response.ok && payload?.ok !== false ? "completed" : "error", responsePayload: payload || { status: response.status } });
  return json(res, response.status, { ...(payload || {}), tae_command: command, tae_persistence: "neon" }, id, passthroughHeaders(response));
}

const normalizedTier = (value) => EXTERNAL_TIERS.has(String(value || "").trim().toLowerCase()) ? String(value).trim().toLowerCase() : "trial";
function tierFromPrice(priceId) {
  for (const [tier, id] of Object.entries(PRICE_BY_TIER)) if (id && id === priceId) return tier;
  return "trial";
}
function normalizedStripeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "active";
  if (value === "trialing") return "trialing";
  if (["canceled", "incomplete_expired"].includes(value)) return "canceled";
  return value || "unknown";
}
async function resolveGid({ gid = null, authUserId = null } = {}) {
  if (gid) return String(gid);
  if (!authUserId) return null;
  const result = await db().query(`select gid from public.jahorin_identities where auth_user_id=$1 order by updated_at desc limit 1`, [authUserId]);
  return result.rows[0]?.gid ? String(result.rows[0].gid) : null;
}
async function syncIdentityTier({ gid = null, authUserId = null, tier = "trial", subscriptionStatus = "active", metadata = {} } = {}) {
  const resolvedGid = await resolveGid({ gid, authUserId });
  if (!resolvedGid) return null;
  const status = normalizedStripeStatus(subscriptionStatus);
  const effectiveTier = ["active", "trialing"].includes(status) ? normalizedTier(tier) : "trial";
  await db().query(`insert into public.jahorin_identities (gid,auth_user_id,identity_scope) values ($1,$2,'consumer') on conflict (gid) do update set auth_user_id=coalesce(excluded.auth_user_id,public.jahorin_identities.auth_user_id),identity_scope='consumer',updated_at=now()`, [resolvedGid, authUserId]);
  const result = await db().query(`insert into public.identity_access (gid,user_type,role_id,tier_id,status,overrides) values ($1,'external','subscriber',$2,'active',$3::jsonb) on conflict (gid) do update set user_type='external',role_id='subscriber',tier_id=excluded.tier_id,status='active',overrides=coalesce(public.identity_access.overrides,'{}'::jsonb)||excluded.overrides,updated_at=now() returning gid,user_type,role_id,tier_id,status,updated_at`, [resolvedGid, effectiveTier, JSON.stringify({ billing: { subscription_status: status, synchronized_at: new Date().toISOString(), ...metadata } })]);
  return result.rows[0] || null;
}

function canonicalBillingConfigured() {
  return Boolean(stripe && stripeWebhookSecret && Object.values(PRICE_BY_TIER).every(Boolean));
}
async function stripeCustomerForMember(principal, { create = false } = {}) {
  if (!stripe) throw Object.assign(new Error("Stripe is not configured"), { status: 503 });
  let customer = null;
  if (principal.email) {
    const list = await stripe.customers.list({ email: principal.email, limit: 100 });
    customer = list.data.find((item) => item.metadata?.user_id === principal.id) || list.data.find((item) => principal.gid && item.metadata?.gid === principal.gid) || null;
  }
  if (!customer && create) customer = await stripe.customers.create({ email: principal.email || undefined, metadata: { user_id: principal.id, gid: principal.gid || "" } });
  return customer;
}
async function handleBillingCatalog(_req, res, id) {
  const rows = await db().query(`select id,name,priority,limits,metadata from public.access_tiers where user_type='external' and enabled=true order by priority,id`);
  return json(res, 200, { ok: true, billing_configured: canonicalBillingConfigured(), tiers: rows.rows.map((row) => ({ ...row, checkout_configured: row.id === "trial" ? false : Boolean(PRICE_BY_TIER[row.id]) })) }, id);
}
async function handleBillingCheckout(req, res, raw, id) {
  if (!canonicalBillingConfigured()) return json(res, 503, { ok: false, code: "BILLING_NOT_CONFIGURED", error: "Canonical Stripe billing is not fully configured" }, id);
  const principal = await memberPrincipal(req);
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; } catch { return json(res, 400, { ok: false, error: "Invalid JSON body" }, id); }
  const tier = String(body.tier || body.plan || "").trim().toLowerCase();
  if (!PAID_TIERS.has(tier)) return json(res, 400, { ok: false, error: "Paid tier must be personal, pro, business, or enterprise" }, id);
  const customer = await stripeCustomerForMember(principal, { create: true });
  const checkout = await stripe.checkout.sessions.create({ mode: "subscription", customer: customer.id, client_reference_id: principal.id, line_items: [{ price: PRICE_BY_TIER[tier], quantity: 1 }], allow_promotion_codes: true, success_url: `${PUBLIC_DOMAIN}/?checkout=return&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${PUBLIC_DOMAIN}/?checkout=cancel`, metadata: { user_id: principal.id, gid: principal.gid || "", tier }, subscription_data: { metadata: { user_id: principal.id, gid: principal.gid || "", tier } } });
  return json(res, 200, { ok: true, url: checkout.url, session_id: checkout.id, tier }, id);
}
async function handleBillingStatus(req, res, id) {
  if (sessionGid(req) === OWNER_GID) return json(res, 200, { ok: true, billing_configured: canonicalBillingConfigured(), tier: "owner", status: "active" }, id);
  const principal = await memberPrincipal(req);
  const customer = await stripeCustomerForMember(principal, { create: false });
  if (!customer || !stripe) return json(res, 200, { ok: true, billing_configured: canonicalBillingConfigured(), tier: "trial", status: "active", subscription: null }, id);
  const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 20 });
  const subscription = subscriptions.data.sort((a, b) => Number(b.created || 0) - Number(a.created || 0))[0] || null;
  if (!subscription) return json(res, 200, { ok: true, billing_configured: canonicalBillingConfigured(), tier: "trial", status: "active", subscription: null }, id);
  const item = subscription.items?.data?.[0] || null;
  const status = normalizedStripeStatus(subscription.status);
  const tier = ["active", "trialing"].includes(status) ? normalizedTier(subscription.metadata?.tier || tierFromPrice(item?.price?.id)) : "trial";
  return json(res, 200, { ok: true, billing_configured: canonicalBillingConfigured(), tier, status, subscription: { id: subscription.id, cancel_at_period_end: Boolean(subscription.cancel_at_period_end), current_period_end: item?.current_period_end || subscription.current_period_end || null } }, id);
}
async function subscriptionFromEvent(event) {
  if (!stripe) return null;
  const object = event?.data?.object || {};
  if (String(event.type || "").startsWith("customer.subscription.")) return object;
  if (event.type === "checkout.session.completed" && object.subscription) return stripe.subscriptions.retrieve(typeof object.subscription === "string" ? object.subscription : object.subscription.id);
  if (["invoice.paid", "invoice.payment_failed"].includes(event.type)) {
    const raw = object.subscription ?? object.parent?.subscription_details?.subscription ?? null;
    const id = typeof raw === "string" ? raw : raw?.id || null;
    if (id) return stripe.subscriptions.retrieve(id);
  }
  return null;
}
async function handleStripeWebhook(req, res, raw, id) {
  if (!stripe || !stripeWebhookSecret) return json(res, 503, { ok: false, error: "Stripe webhook is not configured" }, id);
  const signature = String(req.headers["stripe-signature"] || "");
  if (!signature) return json(res, 400, { ok: false, error: "Missing Stripe-Signature header" }, id);
  let event;
  try { event = stripe.webhooks.constructEvent(raw, signature, stripeWebhookSecret); } catch (error) { return json(res, 400, { ok: false, error: error.message }, id); }
  const subscription = await subscriptionFromEvent(event);
  let access = null;
  if (subscription) {
    const item = subscription.items?.data?.[0] || null;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
    const customer = customerId ? await stripe.customers.retrieve(customerId).catch(() => null) : null;
    access = await syncIdentityTier({ gid: subscription.metadata?.gid || customer?.metadata?.gid || null, authUserId: subscription.metadata?.user_id || customer?.metadata?.user_id || null, tier: normalizedTier(subscription.metadata?.tier || tierFromPrice(item?.price?.id)), subscriptionStatus: subscription.status, metadata: { stripe_customer_id: customerId, stripe_subscription_id: subscription.id, stripe_event_id: event.id, stripe_event_type: event.type } });
  }
  return json(res, 200, { received: true, id: event.id, type: event.type, canonical_access: access }, id);
}

async function handleControl(req, res, raw, pathname, id) {
  await requireOwner(req);
  if (req.method === "GET" && pathname === "/api/control/providers") {
    const result = await db().query(`select id,capability_id,operation,provider,model_alias,fallback_alias,priority,enabled,config,updated_at from public.provider_routes order by capability_id,operation,priority desc,id`);
    return json(res, 200, { ok: true, providers: result.rows }, id);
  }
  if (req.method === "GET" && pathname === "/api/control/scenes") {
    const result = await db().query(`select id,capability_id,name,renderer,version,status,manifest,created_at,updated_at from public.scene_registry order by (manifest->>'number')::int nulls last,id`);
    return json(res, 200, { ok: true, count: result.rowCount, scenes: result.rows }, id);
  }
  if (req.method === "GET" && pathname === "/api/control/tae") {
    const result = await db().query(`select id,command_text,normalized_route,source_surface,execution_state,response_payload,created_at from public.tae_commands order by created_at desc limit 100`);
    return json(res, 200, { ok: true, commands: result.rows }, id);
  }
  if (req.method === "GET" && pathname === "/api/control/tiers") {
    const result = await db().query(`select t.id,t.user_type,t.name,t.priority,t.enabled,t.limits,t.metadata,count(e.*) filter (where e.allowed=true)::int as entitlement_count from public.access_tiers t left join public.tier_entitlements e on e.tier_id=t.id group by t.id,t.user_type,t.name,t.priority,t.enabled,t.limits,t.metadata order by t.user_type,t.priority,t.id`);
    return json(res, 200, { ok: true, tiers: result.rows }, id);
  }
  if (req.method === "GET" && pathname === "/api/control/health") {
    const result = await db().query(`select (select count(*) from public.provider_routes where enabled=true)::int as enabled_provider_routes,(select count(*) from public.scene_registry where status='published')::int as published_scenes,(select count(*) from public.tae_commands)::int as tae_commands,(select count(*) from public.access_tiers where user_type='external' and enabled=true)::int as external_tiers`);
    return json(res, 200, { ok: true, runtime_provider: runtimeProvider, billing_configured: canonicalBillingConfigured(), ...result.rows[0] }, id);
  }
  if (req.method === "POST" && pathname === "/api/control/providers") {
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    const result = await db().query(`insert into public.provider_routes (capability_id,operation,provider,model_alias,fallback_alias,priority,enabled,config) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (capability_id,operation,provider,model_alias) do update set fallback_alias=excluded.fallback_alias,priority=excluded.priority,enabled=excluded.enabled,config=public.provider_routes.config||excluded.config,updated_at=now() returning *`, [body.capability_id, body.operation, body.provider, body.model_alias || "production-default", body.fallback_alias || null, Number(body.priority ?? 100), body.enabled !== false, JSON.stringify(body.config || {})]);
    return json(res, 200, { ok: true, provider_route: result.rows[0] }, id);
  }
  if (req.method === "POST" && pathname === "/api/control/scenes") {
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    const result = await db().query(`insert into public.scene_registry (id,capability_id,name,renderer,version,status,manifest) values ($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict (id) do update set capability_id=excluded.capability_id,name=excluded.name,renderer=excluded.renderer,version=excluded.version,status=excluded.status,manifest=excluded.manifest,updated_at=now() returning *`, [body.id, body.capability_id, body.name, body.renderer, Number(body.version || 1), body.status || "draft", JSON.stringify(body.manifest || {})]);
    return json(res, 200, { ok: true, scene: result.rows[0] }, id);
  }
  if (req.method === "POST" && pathname === "/api/control/identity-tier") {
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    const access = await syncIdentityTier({ gid: body.gid, authUserId: body.auth_user_id, tier: normalizedTier(body.tier), subscriptionStatus: body.subscription_status || "active", metadata: { source: "control-plane-manual" } });
    if (!access) return json(res, 404, { ok: false, error: "Identity could not be resolved" }, id);
    return json(res, 200, { ok: true, access }, id);
  }
  return json(res, 404, { ok: false, error: "Control-plane route not found" }, id);
}

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const needsBody = !["GET", "HEAD"].includes(req.method || "GET");
    const buffered = (pathname === "/api/runtime" && req.method === "POST") || (pathname === "/api/tae" && req.method === "POST") || pathname.startsWith("/api/control/") || pathname === "/api/billing/checkout" || pathname === "/api/stripe/webhook" || pathname === "/stripe/webhook";
    const raw = buffered && needsBody ? await readBody(req) : Buffer.alloc(0);
    if (pathname === "/api/runtime" && req.method === "POST") return await handleRuntime(req, res, raw, id);
    if (pathname === "/api/tae" && req.method === "POST") return await handleTae(req, res, raw, id);
    if (pathname === "/api/billing/catalog" && req.method === "GET") return await handleBillingCatalog(req, res, id);
    if (pathname === "/api/billing/checkout" && req.method === "POST") return await handleBillingCheckout(req, res, raw, id);
    if (pathname === "/api/billing/status" && req.method === "GET") return await handleBillingStatus(req, res, id);
    if ((pathname === "/api/stripe/webhook" || pathname === "/stripe/webhook") && req.method === "POST") return await handleStripeWebhook(req, res, raw, id);
    if (pathname.startsWith("/api/control/")) return await handleControl(req, res, raw, pathname, id);
    return proxyStream(req, res);
  } catch (error) {
    console.error("Jahorin control-plane gateway error", error);
    return json(res, Number(error.status) || 503, { ok: false, error: error.message || "Control-plane failure", request_id: id }, id);
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
waitForPort(innerPort).then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`Jahorin commercial/control gateway ${outerPort}; inner ARI ${innerPort}; provider=${runtimeProvider}; canonical_billing=${canonicalBillingConfigured()}`))).catch((error) => {
  console.error(`ARI control-plane child failed readiness: ${error.message}`);
  if (!child.killed) child.kill("SIGTERM");
  process.exit(1);
});
function shutdown(signal) {
  console.log(`Jahorin control-plane gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
