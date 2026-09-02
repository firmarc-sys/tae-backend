import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import Stripe from "stripe";
import { VertexModelRouter, VERTEX_PROVIDER, modelClassForCapability } from "./vertex-model-router.js";
import { installThothVoiceRoutes, thothVoiceReadiness } from "./thoth-voice.js";

const app = express();
const port = Number(process.env.PORT || 8080);

const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const OWNER_MODE = "Prime Orchestrator";
const SESSION_COOKIE = "ari_session";
const DEMO_PHRASE = "TAE, enter Demo Mode";
const CANONICAL_LINE = "This is not an app. This is me.";

const vertexProject = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.VERTEX_PROJECT || "project-7e6f2720-0291-4c91-8c3";
const vertexLocation = process.env.GOOGLE_CLOUD_LOCATION || process.env.VERTEX_LOCATION || "global";
const provider = VERTEX_PROVIDER;
const vertexRouter = new VertexModelRouter({ project: vertexProject, location: vertexLocation });
const primaryOrchestrationModel = vertexRouter.primaryModel("ORCHESTRATION");
const mercuryRuntimeUrl = (process.env.MERCURY_RUNTIME_URL || "https://agentic-mercury-runtime-689058655022.us-west1.run.app").replace(/\/$/, "");
const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const ownerAccessCode = process.env.OWNER_ACCESS_CODE || process.env.SIOS_OWNER_ACCESS_CODE || "";
const authRequired = !/^(0|false|no|off)$/i.test(process.env.ARI_REQUIRE_AUTH || "true");

const publicDomain = (process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://siaas.space").replace(/\/$/, "");
const supabaseUrl = (process.env.SUPABASE_URL || "https://zrkkilsynurpgwrijicq.supabase.co").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_s4e9QrRI3JtedJlIbuWCgw_BuLR5Iov";
const supabaseServerKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripePriceBeta = process.env.STRIPE_PRICE_BETA || "price_1U54rcPJM0SZC6VXiBCv8uG8";
const stripePriceAlpha = process.env.STRIPE_PRICE_ALPHA || "price_1U54rmPJM0SZC6VXTZYX5PXz";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const TIER_CONFIG = Object.freeze({
  free: {
    priceId: null,
    entitlements: ["interweb.basic", "chat.basic", "scribe.basic"],
  },
  beta: {
    priceId: stripePriceBeta || null,
    entitlements: [
      "interweb.full",
      "chat.full",
      "scribe.full",
      "voice",
      "persistence",
      "syncori.audio",
      "optics.basic",
    ],
  },
  alpha: {
    priceId: stripePriceAlpha || null,
    entitlements: [
      "interweb.full",
      "chat.full",
      "scribe.full",
      "voice",
      "persistence",
      "syncori.audio",
      "syncori.audio.advanced",
      "optics.full",
      "advanced-render",
      "direct-orchestration",
    ],
  },
  owner: {
    priceId: null,
    entitlements: ["*"],
  },
});

const defaultOrigins = [
  "https://jahorin-mercury.netlify.app",
  "https://mercury-timerunner.netlify.app",
  "https://siaas.space",
  "https://www.siaas.space",
  "https://myaihome.space",
  "http://localhost:5173",
];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);


const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServerKey);
const stripeConfigured = Boolean(stripe && stripeWebhookSecret && stripePriceBeta && stripePriceAlpha);
const billingConfigured = Boolean(supabaseConfigured && stripeConfigured);

app.use(helmet({ crossOriginResourcePolicy: false }));

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed"));
    },
  }),
);

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || crypto.randomUUID();
  req.requestId = requestId;
  res.set("x-request-id", requestId);
  res.set("x-runtime", "ARI");
  if (req.path.startsWith("/api/")) res.set("cache-control", "no-store");
  next();
});

function responseBase(extra = {}) {
  return {
    ok: true,
    gid: OWNER_GID,
    mode: OWNER_MODE,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
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

function signSession(gid, expires) {
  if (!sessionSecret) throw httpError(503, "ARI session security is not configured");
  const payload = `${gid}.${expires}`;
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function sessionGid(req) {
  if (!sessionSecret) return null;
  const token = parseCookies(req.get("cookie") || "")[SESSION_COOKIE];
  if (!token) return null;
  const [gid, expiresRaw, signature] = token.split(".", 3);
  const expires = Number(expiresRaw);
  if (!gid || !Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000) || !signature) return null;
  const expected = crypto.createHmac("sha256", sessionSecret).update(`${gid}.${expires}`).digest("hex");
  return timingSafeEqualText(signature, expected) ? gid : null;
}

function generateMemberGid() {
  return String(crypto.randomInt(100000000000, 1000000000000));
}

function bearerToken(req) {
  const value = String(req.get("authorization") || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function requireProviderAccess(req) {
  if (!authRequired) return { kind: "public" };
  const cookieGid = sessionGid(req);
  if (cookieGid) {
    return cookieGid === OWNER_GID
      ? { kind: "owner", gid: OWNER_GID, tier: "owner" }
      : { kind: "guest", gid: cookieGid, tier: "free" };
  }
  if (bearerToken(req) && supabaseConfigured) return authenticatedPrincipal(req);
  throw httpError(401, "Authenticated ARI session required");
}

function renderState(state = "idle") {
  return {
    ok: true,
    runtime: "Mercury",
    state,
    alive: true,
    gid: OWNER_GID,
    mode: OWNER_MODE,
    timestamp_ms: Date.now(),
  };
}

function requireProvider() {
  if (!vertexRouter) throw httpError(503, "Google Vertex AI is not configured on the ARI service.");
  return vertexRouter;
}

function requireSupabase() {
  if (!supabaseConfigured) throw httpError(503, "Supabase is not configured on ARI");
}

function requireStripe() {
  if (!billingConfigured) throw httpError(503, "Stripe billing is not fully configured on ARI");
  return stripe;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return text;
}

async function supabaseRequest(path, { method = "GET", body, userToken, service = false, prefer } = {}) {
  requireSupabase();
  const apiKey = service ? supabaseServerKey : supabaseAnonKey;
  const headers = {
    apikey: apiKey,
    Accept: "application/json",
  };
  // Modern sb_secret_* server keys authenticate through the apikey header and are not JWTs.
  // User sessions and legacy anon/service_role keys still use Authorization: Bearer JWT.
  if (userToken) headers.Authorization = `Bearer ${userToken}`;
  else if (!service || !apiKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${apiKey}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const payload = await readResponse(response);
  if (!response.ok) {
    const message = payload?.msg || payload?.message || payload?.error_description || payload?.error || `Supabase HTTP ${response.status}`;
    const error = httpError(response.status >= 500 ? 503 : response.status, message);
    error.supabaseStatus = response.status;
    throw error;
  }
  return payload;
}

async function supabaseUserFromToken(token) {
  if (!token) throw httpError(401, "Supabase access token required");
  const user = await supabaseRequest("/auth/v1/user", { userToken: token });
  if (!user?.id) throw httpError(401, "Invalid Supabase access token");
  return user;
}

async function authenticatedPrincipal(req) {
  if (sessionGid(req) === OWNER_GID) {
    return {
      kind: "owner",
      id: null,
      email: null,
      gid: OWNER_GID,
      tier: "owner",
      accessToken: null,
    };
  }

  const token = bearerToken(req);
  const user = await supabaseUserFromToken(token);
  return {
    kind: "user",
    id: user.id,
    email: user.email || null,
    gid: user.user_metadata?.gid || null,
    tier: null,
    accessToken: token,
    user,
  };
}

function normalizedTier(tier) {
  return Object.hasOwn(TIER_CONFIG, tier) ? tier : "free";
}

function entitlementsFor(tier, status = "active") {
  const normalized = normalizedTier(tier);
  if (normalized === "owner") return TIER_CONFIG.owner.entitlements;
  if (!["active", "trialing"].includes(status)) return TIER_CONFIG.free.entitlements;
  return TIER_CONFIG[normalized].entitlements;
}

function tierFromPrice(priceId) {
  if (priceId && priceId === stripePriceAlpha) return "alpha";
  if (priceId && priceId === stripePriceBeta) return "beta";
  return "free";
}

function isoFromUnix(value) {
  return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString() : null;
}

async function getSubscription(userId) {
  const rows = await supabaseRequest(
    `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,tier,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,price_id,cancel_at_period_end,created_at,updated_at&limit=1`,
    { service: true },
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getSubscriptionByCustomer(customerId) {
  if (!customerId) return null;
  const rows = await supabaseRequest(
    `/rest/v1/subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=id,user_id,tier,status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,price_id,cancel_at_period_end&limit=1`,
    { service: true },
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function ensureFreeSubscription(userId) {
  const current = await getSubscription(userId);
  if (current) return current;
  const rows = await supabaseRequest("/rest/v1/subscriptions", {
    method: "POST",
    service: true,
    prefer: "return=representation",
    body: {
      user_id: userId,
      tier: "free",
      status: "active",
      cancel_at_period_end: false,
    },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchSubscription(userId, patch) {
  await ensureFreeSubscription(userId);
  const rows = await supabaseRequest(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    service: true,
    prefer: "return=representation",
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function recordPayment(session, userId, tier) {
  if (!session?.id) return;
  await supabaseRequest("/rest/v1/payments?on_conflict=stripe_checkout_session_id", {
    method: "POST",
    service: true,
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      stripe_checkout_session_id: session.id,
      user_id: userId || null,
      stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
      stripe_subscription_id: typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null,
      amount_total: session.amount_total ?? null,
      currency: session.currency || null,
      payment_status: session.payment_status || null,
      mode: session.mode || null,
      plan: tier,
      updated_at: new Date().toISOString(),
    },
  });
}

async function claimStripeEvent(event) {
  try {
    await supabaseRequest("/rest/v1/stripe_events", {
      method: "POST",
      service: true,
      prefer: "return=minimal",
      body: {
        id: event.id,
        type: event.type,
        payload: event,
        processed_at: null,
      },
    });
    return true;
  } catch (error) {
    if (error.supabaseStatus === 409) {
      const rows = await supabaseRequest(`/rest/v1/stripe_events?id=eq.${encodeURIComponent(event.id)}&select=id,processed_at&limit=1`, { service: true });
      const existing = Array.isArray(rows) ? rows[0] : null;
      return !existing?.processed_at;
    }
    throw error;
  }
}

async function completeStripeEvent(eventId) {
  await supabaseRequest(`/rest/v1/stripe_events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    service: true,
    prefer: "return=minimal",
    body: { processed_at: new Date().toISOString() },
  });
}

async function syncStripeSubscription(subscription, { fallbackUserId = null, fallbackTier = null } = {}) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
  const existing = await getSubscriptionByCustomer(customerId);
  const userId = subscription.metadata?.user_id || fallbackUserId || existing?.user_id || null;
  if (!userId) return null;

  const item = subscription.items?.data?.[0] || null;
  const priceId = item?.price?.id || null;
  const eventTier = subscription.metadata?.tier || fallbackTier || tierFromPrice(priceId) || existing?.tier;
  const stripeStatus = String(subscription.status || "").toLowerCase();
  const status = stripeStatus === "active"
    ? "active"
    : stripeStatus === "trialing"
      ? "trialing"
      : ["canceled", "incomplete_expired"].includes(stripeStatus)
        ? "canceled"
        : "past_due";
  const tier = ["active", "trialing"].includes(status) ? normalizedTier(eventTier) : "free";

  return patchSubscription(userId, {
    tier,
    status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    current_period_start: isoFromUnix(subscription.current_period_start ?? item?.current_period_start),
    current_period_end: isoFromUnix(subscription.current_period_end ?? item?.current_period_end),
    price_id: priceId,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  });
}

async function processStripeEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.client_reference_id || null;
      const tier = normalizedTier(session.metadata?.tier || "free");
      if (userId) {
        await recordPayment(session, userId, tier);
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
          await syncStripeSubscription(subscription, { fallbackUserId: userId, fallbackTier: tier });
        }
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncStripeSubscription(event.data.object);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const invoiceSubscription = invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
      const subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : invoiceSubscription?.id || null;
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncStripeSubscription(subscription);
        if (event.type === "invoice.payment_failed") {
          const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id || null;
          const existing = await getSubscriptionByCustomer(customerId);
          if (existing?.user_id) await patchSubscription(existing.user_id, { status: "past_due" });
        }
      }
      break;
    }
    default:
      break;
  }
}

async function stripeWebhookHandler(req, res, next) {
  try {
    if (!stripe || !stripeWebhookSecret || !supabaseConfigured) throw httpError(503, "Stripe webhook is not configured");
    const signature = req.get("stripe-signature");
    if (!signature) throw httpError(400, "Missing Stripe-Signature header");
    const event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    const shouldProcess = await claimStripeEvent(event);
    if (!shouldProcess) return res.json({ received: true, duplicate: true });
    await processStripeEvent(event);
    await completeStripeEvent(event.id);
    return res.json({ received: true, id: event.id, type: event.type });
  } catch (error) {
    return next(error);
  }
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.post("/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
installThothVoiceRoutes(app, { project: vertexProject, location: vertexLocation, authorize: requireProviderAccess });
app.use(express.json({ limit: "10mb" }));

async function mercuryRequest(path, { method = "GET", body, requestId = crypto.randomUUID(), timeout = 10000 } = {}) {
  let response;
  try {
    response = await fetch(`${mercuryRuntimeUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (cause) {
    throw httpError(503, `Mercury Runtime unavailable: ${cause.message}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("json") ? await response.json() : { error: await response.text() };
  if (!response.ok) {
    throw httpError(response.status >= 500 ? 503 : response.status, payload?.error || `Mercury Runtime HTTP ${response.status}`);
  }
  return payload;
}

async function mercuryReady() {
  try {
    const payload = await mercuryRequest("/api/ready", { timeout: 5000 });
    return payload?.ready === true && payload?.runtime === "Mercury";
  } catch {
    return false;
  }
}

async function orchestrateWithMercury(req, { capability, intent, requestId, payload = {} }) {
  let principal = null;
  const cookieGid = sessionGid(req);
  if (cookieGid) {
    principal = cookieGid === OWNER_GID
      ? { kind: "owner", gid: OWNER_GID }
      : { kind: "guest", gid: cookieGid };
  } else if (bearerToken(req) && supabaseConfigured) {
    try { principal = await authenticatedPrincipal(req); } catch { principal = null; }
  }
  const verifiedGid = principal?.gid || principal?.id || null;
  return mercuryRequest("/api/orchestrate", {
    method: "POST",
    requestId,
    body: {
      gid: verifiedGid,
      capability,
      intent,
      request_id: requestId,
      payload,
      context: {
        ...(req.body?.context || {}),
        gid: verifiedGid,
        authenticated: Boolean(principal),
        mode: principal?.kind === "owner" ? OWNER_MODE : principal ? "member" : "public",
      },
    },
  });
}

const SUPPORTED_INLINE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"]);
const MAX_INLINE_IMAGE_BYTES = Math.max(1024, Number(process.env.ARI_MAX_INLINE_IMAGE_BYTES || 6 * 1024 * 1024));
function normalizeInlineImage(payload = {}) {
  const image = payload?.image && typeof payload.image === "object" ? payload.image : {};
  let data = image.data || image.base64 || payload?.image_data || payload?.imageData || "";
  let mimeType = image.mime_type || image.mimeType || payload?.image_mime_type || payload?.imageMimeType || "";
  if (!data) return null;
  const dataUrl = /^data:([^;,]+);base64,(.+)$/s.exec(String(data));
  if (dataUrl) { mimeType ||= dataUrl[1]; data = dataUrl[2]; }
  mimeType = String(mimeType || "").trim().toLowerCase();
  if (mimeType === "image/jpg") mimeType = "image/jpeg";
  if (!SUPPORTED_INLINE_IMAGE_MIME_TYPES.has(mimeType)) throw httpError(415, `Unsupported inline image MIME type: ${mimeType || "missing"}`);
  const compact = String(data).replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) throw httpError(400, "Invalid base64 image data");
  const bytes = Buffer.from(compact, "base64");
  if (!bytes.length || bytes.toString("base64").replace(/=+$/, "") !== compact.replace(/=+$/, "")) throw httpError(400, "Invalid base64 image data");
  if (bytes.length > MAX_INLINE_IMAGE_BYTES) throw httpError(413, `Inline image exceeds ${MAX_INLINE_IMAGE_BYTES} byte limit`);
  return { mimeType, data: bytes.toString("base64"), bytes: bytes.length };
}
function deepSearchRequested(prompt = "") {
  return /\bDEEPSEARCH MANIFESTATION IS ACTIVE\b/i.test(String(prompt || ""));
}

function groundingSourceDomain(uri = "") {
  try { return new URL(String(uri)).hostname.replace(/^www\./, "") || null; }
  catch { return null; }
}

function normalizeGrounding(response) {
  const metadata = response?.candidates?.[0]?.groundingMetadata || {};
  const researchPaths = Array.isArray(metadata.webSearchQueries)
    ? metadata.webSearchQueries.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
  const seen = new Set();
  const sources = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const web = chunks[index]?.web || {};
    const url = String(web.uri || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      id: `source-${sources.length + 1}`,
      title: String(web.title || groundingSourceDomain(url) || `Source ${sources.length + 1}`).trim(),
      url,
      domain: groundingSourceDomain(url),
      status: "grounded",
    });
  }
  return {
    research_paths: researchPaths,
    path_count: Math.max(researchPaths.length, sources.length),
    sources,
    citations: sources,
    contradictions: [],
  };
}

function providerQuotaError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.error?.status || "");
  const message = String(error?.message || error || "");
  return status === 429 || /429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(`${code} ${message}`);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function withProviderRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (!providerQuotaError(error) || attempt === attempts - 1) break;
      const delay = Math.min(2400, 350 * (2 ** attempt)) + crypto.randomInt(50, 220);
      await sleep(delay);
    }
  }
  if (providerQuotaError(lastError)) {
    const error = httpError(429, "Google provider quota is temporarily exhausted. Retry shortly.");
    error.code = "PROVIDER_QUOTA_EXHAUSTED";
    error.retryAfterMs = 2500;
    throw error;
  }
  throw lastError;
}

async function generateWithGoogle({ prompt, systemInstruction, temperature = 0.7, image = null, groundWithSearch = false, capability = "jahorin" }) {
  const router = requireProvider();
  const contents = image ? [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }] : prompt;
  const deepSearch = groundWithSearch || deepSearchRequested(prompt);
  const config = {
    systemInstruction,
    temperature: Math.max(0, Math.min(2, Number(temperature) || 0.7)),
    maxOutputTokens: 4096,
    ...(deepSearch ? { tools: [{ googleSearch: {} }] } : {}),
  };
  const modelClass = modelClassForCapability(capability, { image: Boolean(image), deepSearch });
  const routed = await router.generateContent({ modelClass, contents, config });
  const response = routed.response;
  const text = String(response.text || "").trim();
  if (!text) throw httpError(502, "Google Vertex AI returned no generated text.");
  return {
    text,
    model: routed.model,
    model_class: routed.modelClass,
    model_lifecycle: routed.lifecycle,
    provider: routed.provider,
    location: routed.location,
    fallback_used: routed.fallbackUsed,
    attempted_models: routed.attempted,
    tokens: response.usageMetadata?.totalTokenCount ?? null,
    usage: response.usageMetadata || null,
    media_input: image ? { type: "image", mime_type: image.mimeType, bytes: image.bytes } : null,
    deepsearch: deepSearch ? normalizeGrounding(response) : null,
  };
}

function inferManifest(intent = "", requestedCapability = "", context = {}) {
  const text = String(intent || "").toLowerCase();
  const requested = String(requestedCapability || "").toLowerCase();
  const rules = [
    ["interweb", /search|find|web|research|discover|forecast|weather|news|look up|traverse/],
    ["augment", /music|audio|sound|beat|mix|syncori|song|loop|keys|drums|sample/],
    ["code", /code|build|deploy|terminal|function|html|javascript|repo|runtime|debug|fix|ship/],
    ["thoth", /write|scribe|explain|document|notes|file|summar|draft|memory|recall/],
    ["optics", /camera|image|video|see|capture|analy|optic|horus|xr|visual|photo/],
    ["novalife", /home|novalife|garden|sanctum|project|continue|next|timeline|routine/],
  ];
  let capability = rules.find(([,rx]) => rx.test(text))?.[0] || (["interweb","augment","code","thoth","optics","novalife"].includes(requested) ? requested : "novalife");
  let page = "home";
  if (capability === "interweb") page = /forecast|weather/.test(text) ? "search" : "search";
  if (capability === "augment") page = /keys/.test(text) ? "keys" : /drum/.test(text) ? "drums" : /sample/.test(text) ? "sample" : /loop/.test(text) ? "loop" : "mix";
  if (capability === "code") page = /deploy|ship|publish/.test(text) ? "deploy" : /runtime|debug|test/.test(text) ? "runtime" : "intent";
  if (capability === "thoth") page = /explain/.test(text) ? "explain" : /file/.test(text) ? "files" : /sketch/.test(text) ? "sketch" : "scribe";
  if (capability === "optics") page = /capture|photo/.test(text) ? "capture" : /analy/.test(text) ? "analyze" : "see";
  if (capability === "novalife") page = /weather|forecast/.test(text) ? "weather" : /project|continue|unfinished/.test(text) ? "projects" : /timeline|next|now/.test(text) ? "timeline" : "home-room";
  const requires_confirmation = /(send|publish|deploy|delete|purchase|buy|pay|subscribe|cancel|message|email|post|transfer|book|order)/.test(text);
  const matched = rules.some(([,rx]) => rx.test(text));
  return {
    capability,
    page,
    confidence: matched ? 0.91 : 0.72,
    reason: matched ? `Jahorin mapped this intention to ${capability.toUpperCase()} · ${page.toUpperCase()}.` : `Jahorin kept the current context and selected ${capability.toUpperCase()} · ${page.toUpperCase()}.`,
    requires_confirmation,
    context_source: context?.scene || null,
  };
}

const api = express.Router();

// Cost protection for consumer guest sessions.
const rateBuckets = new Map();
api.use((req, res, next) => {
  if (req.method !== "POST" || !["/runtime", "/generate", "/tae"].includes(req.path)) return next();
  const key = String(req.get("x-forwarded-for") || req.ip || "unknown").split(",")[0].trim();
  const now = Date.now();
  const windowMs = 60_000;
  const max = 24;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.started > windowMs) { rateBuckets.set(key, { started: now, count: 1 }); return next(); }
  bucket.count += 1;
  if (bucket.count > max) return res.status(429).json({ ok: false, error: "Rate limit exceeded. Try again shortly.", request_id: req.requestId });
  next();
});

api.get("/capabilities", (_req, res) => {
  res.json(responseBase({ capabilities: [
    { id: "interweb", deity: "Wepwawet" },
    { id: "augment", deity: "Hathor" },
    { id: "code", deity: "Ptah" },
    { id: "thoth", deity: "Thoth" },
    { id: "optics", deity: "Horus" },
    { id: "novalife", deity: "NovaLife" },
  ] }));
});
api.get("/timeline", (req, res) => res.json(responseBase({ gid: sessionGid(req), turns: [], persistence: "device-local", cloud_sync: false })));
api.post("/timeline", (req, res) => res.json(responseBase({ gid: sessionGid(req), accepted: true, persistence: "device-local", cloud_sync: false, turn: req.body || {} })));
api.get("/state/:gid", (req, res, next) => {
  const gid = sessionGid(req);
  if (!gid) return next(httpError(401, "Authenticated ARI session required"));
  if (req.params.gid !== gid) return next(httpError(403, "GID state access denied"));
  return res.json(responseBase({ gid, state: null, persistence: "device-local", cloud_sync: false }));
});
api.get("/twin", (req, res, next) => { const gid=sessionGid(req); if(!gid)return next(httpError(401,"Authenticated ARI session required")); res.json(responseBase({ gid, twin:null, persistence:"device-local", cloud_sync:false })); });
for (const path of ["/twin/context","/twin/interaction","/twin/outcome","/twin/correction"]) {
  api.post(path, (req, res, next) => { const gid=sessionGid(req); if(!gid)return next(httpError(401,"Authenticated ARI session required")); res.json(responseBase({ gid, accepted:true, persistence:"device-local", cloud_sync:false })); });
}
api.get("/twin/predictions", (req, res, next) => { const gid=sessionGid(req); if(!gid)return next(httpError(401,"Authenticated ARI session required")); res.json(responseBase({ gid, predictions:[], persistence:"device-local", cloud_sync:false })); });

api.get("/health", (_req, res) => {
  res.json(
    responseBase({
      service: "ARI",
      runtime: "Mercury",
      status: "healthy",
      provider,
      mercury_runtime: mercuryRuntimeUrl,
      supabase_configured: supabaseConfigured,
      stripe_configured: stripeConfigured,
      billing_configured: billingConfigured,
      ...thothVoiceReadiness({ project: vertexProject, location: vertexLocation }),
    }),
  );
});

api.get("/ready", async (_req, res) => {
  const providerConfigured = Boolean(vertexRouter);
  const ownerAuthConfigured = Boolean(sessionSecret && ownerAccessCode);
  const memberAuthConfigured = supabaseConfigured;
  const guestAuthConfigured = Boolean(sessionSecret);
  const authenticationConfigured = !authRequired || guestAuthConfigured || memberAuthConfigured || ownerAuthConfigured;
  const runtimeReady = await mercuryReady();
  const ready = providerConfigured && authenticationConfigured && runtimeReady;
  res.status(ready ? 200 : 503).json(
    responseBase({
      ok: ready,
      service: "ARI",
      runtime: "Mercury",
      provider,
      provider_configured: providerConfigured,
      model: primaryOrchestrationModel,
      vertex_project: provider === "google-vertex-ai" ? vertexProject : null,
      vertex_location: provider === "google-vertex-ai" ? vertexLocation : null,
      auth_required: authRequired,
      auth_configured: authenticationConfigured,
      member_auth_configured: memberAuthConfigured,
      guest_auth_configured: guestAuthConfigured,
      owner_auth_configured: ownerAuthConfigured,
      supabase_configured: supabaseConfigured,
      stripe_configured: stripeConfigured,
      billing_configured: billingConfigured,
      ...thothVoiceReadiness({ project: vertexProject, location: vertexLocation }),
      mercury_runtime_ready: runtimeReady,
      mercury_runtime: mercuryRuntimeUrl,
    }),
  );
});

api.get("/identity", async (req, res) => {
  const gid = sessionGid(req);
  if (gid === OWNER_GID) {
    return res.json(responseBase({ authenticated: true, identity_scope: "prime", clearance: OWNER_MODE, tier: "owner", entitlements: ["*"] }));
  }
  if (gid) {
    return res.json(responseBase({ gid, mode: "consumer", authenticated: true, identity_scope: "consumer", clearance: "member", tier: "free", entitlements: TIER_CONFIG.free.entitlements }));
  }

  const token = bearerToken(req);
  if (token && supabaseConfigured) {
    try {
      const user = await supabaseUserFromToken(token);
      const subscription = await ensureFreeSubscription(user.id);
      return res.json(
        responseBase({
          gid: user.user_metadata?.gid || null,
          mode: "member",
          authenticated: true,
          identity_scope: "member",
          clearance: "member",
          user: { id: user.id, email: user.email || null, display_name: user.user_metadata?.display_name || null },
          tier: normalizedTier(subscription?.tier),
          subscription_status: subscription?.status || "active",
          entitlements: entitlementsFor(subscription?.tier, subscription?.status),
        }),
      );
    } catch {
      // Invalid bearer token falls through to unauthenticated display state.
    }
  }

  return res.json(responseBase({ authenticated: false, identity_scope: "display", clearance: "public", tier: "free", entitlements: TIER_CONFIG.free.entitlements }));
});

api.post("/identity", async (req, res) => {
  const gid = sessionGid(req);
  if (gid === OWNER_GID) {
    return res.json(responseBase({ authenticated: true, identity: { gid: OWNER_GID, verified: true, clearance: OWNER_MODE, tier: "owner" } }));
  }
  if (gid) {
    return res.json(responseBase({ gid, mode: "consumer", authenticated: true, identity: { gid, verified: true, clearance: "member", tier: "free" } }));
  }
  try {
    const principal = await authenticatedPrincipal(req);
    const subscription = principal.kind === "user" ? await ensureFreeSubscription(principal.id) : null;
    return res.json(
      responseBase({
        gid: principal.gid,
        mode: principal.kind === "owner" ? OWNER_MODE : "member",
        authenticated: true,
        identity: {
          gid: principal.gid,
          user_id: principal.id,
          verified: true,
          clearance: principal.kind === "owner" ? OWNER_MODE : "member",
          tier: principal.kind === "owner" ? "owner" : normalizedTier(subscription?.tier),
        },
      }),
    );
  } catch {
    return res.json(responseBase({ authenticated: false, identity: { gid: null, verified: false, clearance: "public", tier: "free" } }));
  }
});

api.post("/identity/session", (req, res, next) => {
  try {
    if (!ownerAccessCode || !sessionSecret) throw httpError(503, "ARI session security is not configured");
    const supplied = String(req.body?.access_code || "");
    if (!timingSafeEqualText(supplied, ownerAccessCode)) throw httpError(401, "Invalid access code");
    const expires = Math.floor(Date.now() / 1000) + Number(process.env.ARI_SESSION_TTL_SECONDS || 43200);
    const token = signSession(OWNER_GID, expires);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(60, expires - Math.floor(Date.now() / 1000))}; HttpOnly; Secure; SameSite=Strict`,
    );
    res.json(responseBase({ authenticated: true, expires, tier: "owner", entitlements: ["*"] }));
  } catch (error) {
    next(error);
  }
});

api.delete("/identity/session", (_req, res) => {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  res.json(responseBase({ authenticated: false }));
});

api.post("/identity/guest", (req, res, next) => {
  try {
    if (!sessionSecret) throw httpError(503, "ARI session security is not configured");
    let gid = generateMemberGid();
    while (gid === OWNER_GID) gid = generateMemberGid();
    const expires = Math.floor(Date.now() / 1000) + Number(process.env.ARI_SESSION_TTL_SECONDS || 2592000);
    const token = signSession(gid, expires);
    res.setHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(60, expires - Math.floor(Date.now() / 1000))}; HttpOnly; Secure; SameSite=Strict`,
    );
    res.status(201).json(responseBase({ gid, mode: "consumer", authenticated: true, identity_scope: "consumer", tier: "free", expires }));
  } catch (error) {
    next(error);
  }
});

api.post("/auth/signup", async (req, res, next) => {
  try {
    requireSupabase();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const displayName = String(req.body?.display_name || "").trim();
    if (!email || !password) throw httpError(400, "email and password are required");
    if (password.length < 8) throw httpError(400, "password must be at least 8 characters");

    const result = await supabaseRequest("/auth/v1/signup", {
      method: "POST",
      body: {
        email,
        password,
        data: { ...(displayName ? { display_name: displayName } : {}), gid: generateMemberGid() },
      },
    });
    if (result?.user?.id) await ensureFreeSubscription(result.user.id);
    res.status(201).json({
      ok: true,
      user: result?.user || null,
      access_token: result?.access_token || null,
      refresh_token: result?.refresh_token || null,
      expires_in: result?.expires_in || null,
      confirmation_required: Boolean(result?.user && !result?.access_token),
      tier: "free",
      entitlements: TIER_CONFIG.free.entitlements,
    });
  } catch (error) {
    next(error);
  }
});

api.post("/auth/login", async (req, res, next) => {
  try {
    requireSupabase();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) throw httpError(400, "email and password are required");
    const result = await supabaseRequest("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email, password },
    });
    if (result?.user?.id) await ensureFreeSubscription(result.user.id);
    const subscription = result?.user?.id ? await getSubscription(result.user.id) : null;
    res.json({
      ok: true,
      ...result,
      tier: normalizedTier(subscription?.tier),
      subscription_status: subscription?.status || "active",
      entitlements: entitlementsFor(subscription?.tier, subscription?.status),
    });
  } catch (error) {
    next(error);
  }
});

api.post("/auth/refresh", async (req, res, next) => {
  try {
    requireSupabase();
    const refreshToken = String(req.body?.refresh_token || "");
    if (!refreshToken) throw httpError(400, "refresh_token is required");
    const result = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

api.get("/auth/me", async (req, res, next) => {
  try {
    const principal = await authenticatedPrincipal(req);
    if (principal.kind === "owner") return res.json(responseBase({ authenticated: true, tier: "owner", entitlements: ["*"] }));
    const subscription = await ensureFreeSubscription(principal.id);
    res.json({
      ok: true,
      authenticated: true,
      user: { id: principal.id, email: principal.email, gid: principal.gid, display_name: principal.user?.user_metadata?.display_name || null },
      tier: normalizedTier(subscription?.tier),
      subscription_status: subscription?.status || "active",
      entitlements: entitlementsFor(subscription?.tier, subscription?.status),
    });
  } catch (error) {
    next(error);
  }
});

api.get("/billing/status", async (req, res, next) => {
  try {
    const principal = await authenticatedPrincipal(req);
    if (principal.kind === "owner") {
      return res.json(responseBase({ billing_configured: billingConfigured, tier: "owner", status: "active", entitlements: ["*"], subscription: null }));
    }
    const subscription = await ensureFreeSubscription(principal.id);
    const tier = normalizedTier(subscription?.tier);
    const status = subscription?.status || "active";
    return res.json({
      ok: true,
      billing_configured: billingConfigured,
      user_id: principal.id,
      tier,
      status,
      entitlements: entitlementsFor(tier, status),
      subscription,
    });
  } catch (error) {
    next(error);
  }
});

api.post("/billing/checkout", async (req, res, next) => {
  try {
    const stripeClient = requireStripe();
    const principal = await authenticatedPrincipal(req);
    if (principal.kind === "owner") throw httpError(400, "Owner tier does not require Stripe checkout");
    const tier = normalizedTier(String(req.body?.tier || req.body?.plan || ""));
    if (!["beta", "alpha"].includes(tier)) throw httpError(400, "Paid tier must be beta or alpha");
    const priceId = TIER_CONFIG[tier].priceId;
    if (!priceId) throw httpError(503, `Stripe price for ${tier} is not configured`);

    let subscription = await ensureFreeSubscription(principal.id);
    if (subscription?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(subscription?.status) && subscription?.tier !== "free") {
      throw httpError(409, "An active paid subscription already exists; use the billing portal to change plans");
    }
    let customerId = subscription?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: principal.email || undefined,
        metadata: { user_id: principal.id, gid: principal.gid || "" },
      });
      customerId = customer.id;
      subscription = await patchSubscription(principal.id, { stripe_customer_id: customerId });
    }

    const checkout = await stripeClient.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: principal.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${publicDomain}/?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicDomain}/?checkout=cancel`,
      metadata: { user_id: principal.id, tier },
      subscription_data: { metadata: { user_id: principal.id, tier } },
    });

    res.json({ ok: true, url: checkout.url, session_id: checkout.id, tier });
  } catch (error) {
    next(error);
  }
});

api.post("/billing/portal", async (req, res, next) => {
  try {
    const stripeClient = requireStripe();
    const principal = await authenticatedPrincipal(req);
    if (principal.kind === "owner") throw httpError(400, "Owner tier does not require a billing portal");
    const subscription = await getSubscription(principal.id);
    if (!subscription?.stripe_customer_id) throw httpError(409, "No Stripe customer exists for this account yet");
    const portal = await stripeClient.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${publicDomain}/?billing=return`,
    });
    res.json({ ok: true, url: portal.url });
  } catch (error) {
    next(error);
  }
});

api.get("/render-state", async (req, res, next) => {
  try {
    const runtime = await mercuryRequest("/api/render-state", { requestId: req.requestId });
    res.json(responseBase({ render_state: runtime.renderState || runtime.render_state || runtime }));
  } catch (error) {
    next(error);
  }
});

api.post("/render-state", async (req, res, next) => {
  try {
    const runtime = await mercuryRequest("/api/render-state", {
      method: "POST",
      requestId: req.requestId,
      body: req.body || {},
    });
    res.json(responseBase({ render_state: runtime.renderState || runtime.render_state || runtime }));
  } catch (error) {
    next(error);
  }
});

api.get("/iot", async (req, res, next) => {
  try {
    const runtime = await orchestrateWithMercury(req, {
      capability: "iot",
      intent: "inspect devices",
      requestId: req.requestId,
    });
    res.json(responseBase({ capability: "iot", status: "online", devices: [], orchestration: runtime.orchestration, render_state: runtime.renderState }));
  } catch (error) {
    next(error);
  }
});

api.post("/iot", async (req, res, next) => {
  try {
    const runtime = await orchestrateWithMercury(req, {
      capability: "iot",
      intent: String(req.body?.action || "device command"),
      requestId: req.requestId,
      payload: req.body || {},
    });
    res.json(responseBase({ capability: "iot", accepted: true, payload: req.body || {}, orchestration: runtime.orchestration, render_state: runtime.renderState }));
  } catch (error) {
    next(error);
  }
});

api.get("/syncori", async (req, res, next) => {
  try {
    const runtime = await orchestrateWithMercury(req, {
      capability: "syncori",
      intent: "inspect SYNCORI",
      requestId: req.requestId,
    });
    res.json(responseBase({ capability: "syncori", status: "online", engine: "SYNCORI Infinite Audio", orchestration: runtime.orchestration, render_state: runtime.renderState }));
  } catch (error) {
    next(error);
  }
});

api.post("/syncori", async (req, res, next) => {
  try {
    const runtime = await orchestrateWithMercury(req, {
      capability: "syncori",
      intent: String(req.body?.action || "update SYNCORI state"),
      requestId: req.requestId,
      payload: req.body || {},
    });
    res.json(responseBase({ capability: "syncori", accepted: true, state: req.body || {}, orchestration: runtime.orchestration, render_state: runtime.renderState }));
  } catch (error) {
    next(error);
  }
});

api.get("/tae", async (req, res, next) => {
  try {
    const runtime = await mercuryRequest("/api/tae", { requestId: req.requestId });
    res.json(responseBase({ engine: "TAE", activation: DEMO_PHRASE, runtime }));
  } catch (error) {
    next(error);
  }
});

api.post("/tae", async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || req.body?.command || "").trim();
    if (!prompt) return res.status(422).json({ ok: false, error: "prompt is required", request_id: req.requestId });
    await requireProviderAccess(req);

    if (prompt.replace(/\.$/, "").toLowerCase() === DEMO_PHRASE.toLowerCase()) {
      const runtime = await mercuryRequest("/api/tae", {
        method: "POST",
        requestId: req.requestId,
        body: { prompt, context: { gid: sessionGid(req) } },
      });
      return res.json(
        responseBase({
          request_id: req.body?.request_id || req.requestId,
          demo: true,
          message: runtime.message || CANONICAL_LINE,
          render_state: runtime.renderState || renderState("generate"),
          orchestration: runtime.orchestration,
          reply: { kind: "prose", text: runtime.message || CANONICAL_LINE, tokens: 0 },
        }),
      );
    }
    const deepSearch = String(req.body?.mode || "").toLowerCase() === "deepsearch" || deepSearchRequested(prompt);
  const runtime = await orchestrateWithMercury(req, {
    capability: deepSearch ? "interweb" : "tae",
    intent: prompt,
    requestId: req.body?.request_id || req.requestId,
    payload: req.body || {},
  });
    await requireProviderAccess(req);
    const result = await generateWithGoogle({
      prompt,
      capability: deepSearch ? "interweb" : "tae",
      systemInstruction:
        "You are TAE, the Timeline Augmentation and orchestration intelligence inside Agentic Mercury Time Runner. Coordinate the user request clearly and return useful production-grade results.",
      temperature: req.body?.temperature,
    groundWithSearch: deepSearch,
  });

    res.json(
      responseBase({
        request_id: req.body?.request_id || req.requestId,
        orchestration: runtime.orchestration,
        render_state: runtime.renderState,
        reply: {
    kind: "prose",
    text: result.text,
    tokens: result.tokens,
    ...(result.deepsearch ? {
      sources: result.deepsearch.sources,
      citations: result.deepsearch.citations,
      research_paths: result.deepsearch.research_paths,
      path_count: result.deepsearch.path_count,
      contradictions: result.deepsearch.contradictions,
    } : {}),
  },
  deepsearch: result.deepsearch,
        provider: { name: result.provider, model: result.model, model_class: result.model_class, lifecycle: result.model_lifecycle, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models },
      }),
    );
  } catch (error) {
    next(error);
  }
});

api.post("/runtime", async (req, res, next) => {
  try {
    const requestedCapability = String(req.body?.capability || "text").trim().toLowerCase();
    const intent = String(req.body?.intent || req.body?.payload?.prompt || "").trim();
    const requestId = req.body?.request_id || req.requestId;
    const manifest = inferManifest(intent, requestedCapability, req.body?.context || {});
    const capability = manifest.capability;
    const inlineImage = normalizeInlineImage(req.body?.payload || {});
    await requireProviderAccess(req);

    const runtime = await orchestrateWithMercury(req, {
      capability,
      intent,
      requestId,
      payload: req.body?.payload || {},
    });
    const orchestration = runtime.orchestration || {};
    const providerRequired = orchestration.providerRequired === true || Boolean(inlineImage);

    if (providerRequired) {
      const providerPrompt = intent || (inlineImage ? "Analyze the provided image and answer the user’s visual question." : "");
      if (!providerPrompt) return res.status(422).json({ ok: false, error: "intent or payload.prompt is required", request_id: requestId });
      await requireProviderAccess(req);
      const result = await generateWithGoogle({
        prompt: providerPrompt,
        capability,
        image: inlineImage,
        systemInstruction:
          "You are Jahorin, the user-facing intelligence inside Agentic Mercury Time Runner. Respond directly to the user's intent and use the active Mercury capability as an instrument.",
        temperature: req.body?.payload?.temperature,
      });
      return res.json(
        responseBase({
          request_id: requestId,
          manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation,
          orchestration,
          render_state: runtime.renderState,
          result: { text: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, tokens: result.tokens, media_input: result.media_input },
          provider: { name: result.provider, model: result.model, model_class: result.model_class, lifecycle: result.model_lifecycle, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models },
        }),
      );
    }

    if (capability === "identity") {
      const authenticated = sessionGid(req) === OWNER_GID;
      return res.json(responseBase({ request_id: requestId, manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation, orchestration, render_state: runtime.renderState, result: { gid: authenticated ? OWNER_GID : null, mode: authenticated ? OWNER_MODE : "public", authenticated } }));
    }
    if (capability === "syncori") {
      return res.json(responseBase({ request_id: requestId, manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation, orchestration, render_state: runtime.renderState, result: { status: "online", engine: "SYNCORI Infinite Audio" } }));
    }
    if (capability === "iot") {
      return res.json(responseBase({ request_id: requestId, manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation, orchestration, render_state: runtime.renderState, result: { status: "online", devices: [] } }));
    }
    if (["tae", "demo"].includes(capability) && intent.replace(/\.$/, "").toLowerCase() === DEMO_PHRASE.toLowerCase()) {
      return res.json(responseBase({ request_id: requestId, manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation, orchestration, render_state: runtime.renderState, result: { demo: true, message: CANONICAL_LINE } }));
    }

    return res.json(responseBase({ request_id: requestId, manifest, capability: manifest.capability, page: manifest.page, confidence: manifest.confidence, reason: manifest.reason, requires_confirmation: manifest.requires_confirmation, orchestration, render_state: runtime.renderState, result: { accepted: true, execution: orchestration.execution || "local-runtime" } }));
  } catch (error) {
    next(error);
  }
});

api.post("/generate", async (req, res, next) => {
  try {
    const inlineImage = normalizeInlineImage(req.body || {});
    const prompt = String(req.body?.prompt || "").trim() || (inlineImage ? "Analyze the provided image." : "");
    if (!prompt) return res.status(400).json({ ok: false, error: "prompt is required", request_id: req.requestId });
    if (prompt.length > 20000) return res.status(413).json({ ok: false, error: "prompt is too long", request_id: req.requestId });
    await requireProviderAccess(req);

    const runtime = await orchestrateWithMercury(req, {
      capability: String(req.body?.type || "text").toLowerCase(),
      intent: prompt,
      requestId: req.requestId,
      payload: req.body || {},
    });
    await requireProviderAccess(req);
    const result = await generateWithGoogle({
      prompt,
      capability: String(req.body?.type || "scribe"),
      image: inlineImage,
      systemInstruction:
        String(req.body?.systemInstruction || "").trim() ||
        "You are Jahorin inside Agentic Mercury Time Runner. Produce useful, original, polished content that directly fulfills the user's request.",
      temperature: req.body?.temperature,
    });
    res.json(responseBase({ type: String(req.body?.type || "text"), orchestration: runtime.orchestration, render_state: runtime.renderState, output: result.text, model: result.model, model_class: result.model_class, model_lifecycle: result.model_lifecycle, provider: result.provider, location: result.location, fallback_used: result.fallback_used, attempted_models: result.attempted_models, usage: result.usage, media_input: result.media_input }));
  } catch (error) {
    next(error);
  }
});

api.get("/models", (_req, res) => {
  res.json(responseBase({ provider: VERTEX_PROVIDER, provider_boundary: "VERTEX_AI_ONLY", project: vertexProject, location: vertexLocation, models: vertexRouter.manifest() }));
});

api.post("/image", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateImage({ prompt });
    res.json(responseBase({ request_id: req.requestId, type: "image", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location }, asset: { mime_type: result.mimeType, data: result.data }, text: result.text }));
  } catch (error) { next(error); }
});

api.post("/video", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateVideo({ prompt, aspectRatio: String(req.body?.aspect_ratio || "16:9"), durationSeconds: Number(req.body?.duration_seconds || 8) });
    res.json(responseBase({ request_id: req.requestId, type: "video", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, asset: result.video }));
  } catch (error) { next(error); }
});

api.post("/audio", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(422, "prompt is required");
    const result = await vertexRouter.generateAudio({ prompt });
    res.json(responseBase({ request_id: req.requestId, type: "audio", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, asset: { mime_type: result.mimeType, data: result.data }, outputs: result.outputs }));
  } catch (error) { next(error); }
});

api.post("/embeddings", async (req, res, next) => {
  try {
    await requireProviderAccess(req);
    const content = String(req.body?.content || req.body?.text || "").trim();
    if (!content) throw httpError(422, "content is required");
    const result = await vertexRouter.embed({ content });
    res.json(responseBase({ request_id: req.requestId, type: "embedding", provider: { name: result.provider, model: result.model, lifecycle: result.lifecycle, model_class: result.modelClass, location: result.location, fallback_used: result.fallbackUsed, attempted_models: result.attempted }, embeddings: result.embeddings }));
  } catch (error) { next(error); }
});

app.get("/", (_req, res) => {
  res.json(responseBase({ service: "ARI", runtime: "Mercury", status: "online", provider, mercury_runtime: mercuryRuntimeUrl, billing_configured: billingConfigured }));
});

app.use("/api", api);
app.use("/", api);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = Number(error.status) || 500;
  if (error?.retryAfterMs) res.set("retry-after", String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
  res.status(status).json({
    ok: false,
    error: error.message || "Unexpected ARI error",
    code: error.code || (status === 429 ? "RATE_LIMITED" : "ARI_ERROR"),
    ...(error.retryAfterMs ? { retry_after_ms: error.retryAfterMs } : {}),
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`ARI gateway listening on ${port}`);
});
