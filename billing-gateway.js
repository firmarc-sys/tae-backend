import "dotenv/config";
import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import Stripe from "stripe";
import { Pool } from "pg";

const outerPort = Number(process.env.PORT || 8080);
const innerPort = Number(process.env.BILLING_GATEWAY_INNER_PORT || 8088);
const OWNER_GID = process.env.SIOS_OWNER_GID || "399152573423";
const SESSION_COOKIE = "ari_session";
const PUBLIC_DOMAIN = (process.env.PUBLIC_DOMAIN || process.env.FRONTEND_URL || "https://siaas.space").replace(/\/$/, "");

const legacyJwtSecret = process.env.JWT_SECRET || "";
const sessionSecret = process.env.ARI_SESSION_SECRET || (legacyJwtSecret && legacyJwtSecret !== "CHANGE-ME-IN-PROD" ? legacyJwtSecret : "");
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = connectionString
  ? new Pool({ connectionString, max: Math.max(2, Number(process.env.NEON_POOL_MAX || 5)), idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 })
  : null;
const supabaseUrl = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

const PRICE_BY_TIER = Object.freeze({
  personal: process.env.STRIPE_PRICE_PERSONAL || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  business: process.env.STRIPE_PRICE_BUSINESS || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
});
const LOOKUP_BY_TIER = Object.freeze({
  personal: process.env.STRIPE_LOOKUP_PERSONAL || "siaas_personal",
  pro: process.env.STRIPE_LOOKUP_PRO || "siaas_pro",
  business: process.env.STRIPE_LOOKUP_BUSINESS || "siaas_business",
  enterprise: process.env.STRIPE_LOOKUP_ENTERPRISE || "siaas_enterprise",
});
const PAID_TIERS = Object.freeze(["personal", "pro", "business", "enterprise"]);
const PUBLIC_TIERS = Object.freeze(["free", ...PAID_TIERS]);
const priceCache = new Map();

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

const child = spawn(process.execPath, ["subscription-entitlement-gateway.js"], {
  env: { ...process.env, PORT: String(innerPort) },
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  console.error(`ARI subscription entitlement gateway exited code=${code} signal=${signal || ""}`);
  process.exit(code || 1);
});

function db() {
  if (!pool) throw Object.assign(new Error("Neon is not configured on ARI"), { status: 503, code: "BILLING_AUTHORITY_UNAVAILABLE" });
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
    "access-control-expose-headers": "x-request-id,x-runtime,x-billing-authority,x-entitlement-authority",
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
    "x-billing-authority": "stripe-neon-v1",
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
    user_id: String(user.id),
    gid: user.user_metadata?.gid ? String(user.user_metadata.gid) : null,
    email: user.email || null,
  };
}

async function resolveGidFromAuthUser(authUserId) {
  if (!authUserId) return null;
  const result = await db().query(
    `select gid from public.jahorin_identities where auth_user_id=$1 order by updated_at desc limit 1`,
    [authUserId],
  );
  return result.rows[0]?.gid ? String(result.rows[0].gid) : null;
}

async function billingPrincipal(req) {
  const gid = sessionGid(req);
  if (gid) return { kind: gid === OWNER_GID ? "owner" : "consumer", gid, user_id: null, email: null };
  const member = await bearerPrincipal(req);
  if (!member) throw Object.assign(new Error("Authenticated GID required"), { status: 401, code: "AUTH_REQUIRED" });
  if (!member.gid) member.gid = await resolveGidFromAuthUser(member.user_id);
  if (!member.gid) throw Object.assign(new Error("Authenticated member has no GID"), { status: 409, code: "GID_REQUIRED" });
  return member;
}

function publicTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  if (tier === "owner") return "owner";
  if (tier === "personal" || tier === "beta") return "personal";
  if (tier === "pro" || tier === "alpha") return "pro";
  if (tier === "business") return "business";
  if (tier === "enterprise") return "enterprise";
  return "free";
}

function internalTier(value) {
  const tier = publicTier(value);
  return tier === "free" ? "trial" : tier;
}

function normalizedStripeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "active") return "active";
  if (value === "trialing") return "trialing";
  if (["canceled", "incomplete_expired"].includes(value)) return "canceled";
  return value || "unknown";
}

async function billingOverrides(gid) {
  if (!gid) return {};
  const result = await db().query(`select overrides from public.identity_access where gid=$1 limit 1`, [gid]);
  return result.rows[0]?.overrides?.billing || {};
}

async function patchBillingOverrides(gid, patch = {}) {
  if (!gid) return null;
  const result = await db().query(
    `update public.identity_access
     set overrides=jsonb_set(
       coalesce(overrides,'{}'::jsonb),
       '{billing}',
       coalesce(overrides->'billing','{}'::jsonb) || $2::jsonb,
       true
     ), updated_at=now()
     where gid=$1
     returning gid,tier_id,status,overrides,updated_at`,
    [gid, JSON.stringify(patch)],
  );
  return result.rows[0] || null;
}

async function syncIdentityTier({ gid, userId = null, tier = "free", status = "active", metadata = {} }) {
  if (!gid) return null;
  const stripeStatus = normalizedStripeStatus(status);
  const effectiveTier = ["active", "trialing"].includes(stripeStatus) ? internalTier(tier) : "trial";
  await db().query(
    `insert into public.jahorin_identities (gid,auth_user_id,identity_scope)
     values ($1,$2,'consumer')
     on conflict (gid) do update set
       auth_user_id=coalesce(excluded.auth_user_id,public.jahorin_identities.auth_user_id),
       identity_scope='consumer',
       updated_at=now()`,
    [gid, userId],
  );
  const result = await db().query(
    `insert into public.identity_access (gid,user_type,role_id,tier_id,status,overrides)
     values ($1,'external','subscriber',$2,'active',$3::jsonb)
     on conflict (gid) do update set
       user_type='external',
       role_id='subscriber',
       tier_id=excluded.tier_id,
       status='active',
       overrides=jsonb_set(
         coalesce(public.identity_access.overrides,'{}'::jsonb),
         '{billing}',
         coalesce(public.identity_access.overrides->'billing','{}'::jsonb) || coalesce(excluded.overrides->'billing','{}'::jsonb),
         true
       ),
       updated_at=now()
     returning gid,user_type,role_id,tier_id,status,overrides,updated_at`,
    [gid, effectiveTier, JSON.stringify({ billing: { subscription_status: stripeStatus, synchronized_at: new Date().toISOString(), ...metadata } })],
  );
  return result.rows[0] || null;
}

function canonicalProductName(tier) {
  return `S.I.aaS ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

function priceSummary(price) {
  if (!price || price.active === false || !price.recurring) return null;
  const product = typeof price.product === "object" && price.product ? price.product : null;
  return {
    id: price.id,
    active: price.active !== false,
    currency: price.currency,
    unit_amount: price.unit_amount,
    unit_amount_decimal: price.unit_amount_decimal || null,
    recurring: {
      interval: price.recurring.interval,
      interval_count: price.recurring.interval_count || 1,
      usage_type: price.recurring.usage_type || "licensed",
    },
    lookup_key: price.lookup_key || null,
    product: product ? { id: product.id, name: product.name || null, metadata: product.metadata || {} } : { id: String(price.product || ""), name: null, metadata: {} },
  };
}

async function resolveStripePrice(tier, { refresh = false } = {}) {
  if (!stripe || !PAID_TIERS.includes(tier)) return null;
  const cached = priceCache.get(tier);
  if (!refresh && cached && Date.now() - cached.at < 60_000) return cached.value;

  let price = null;
  const configuredId = PRICE_BY_TIER[tier];
  if (configuredId) {
    price = await stripe.prices.retrieve(configuredId, { expand: ["product"] }).catch(() => null);
  }

  if (!price) {
    const lookupKey = LOOKUP_BY_TIER[tier];
    if (lookupKey) {
      const list = await stripe.prices.list({ active: true, lookup_keys: [lookupKey], limit: 10, expand: ["data.product"] }).catch(() => null);
      price = list?.data?.find((item) => item.recurring) || null;
    }
  }

  if (!price) {
    const products = await stripe.products.list({ active: true, limit: 100 }).catch(() => null);
    const targetName = canonicalProductName(tier).toLowerCase();
    const product = products?.data?.find((item) => {
      const metadataTier = publicTier(item.metadata?.siaas_tier || item.metadata?.tier || "");
      return metadataTier === tier || String(item.name || "").trim().toLowerCase() === targetName;
    }) || null;
    if (product) {
      const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100, expand: ["data.product"] }).catch(() => null);
      price = prices?.data?.filter((item) => item.recurring).sort((a, b) => Number(b.created || 0) - Number(a.created || 0))[0] || null;
    }
  }

  const summary = priceSummary(price);
  priceCache.set(tier, { at: Date.now(), value: summary });
  return summary;
}

async function tierFromPrice(priceId) {
  for (const tier of PAID_TIERS) {
    const resolved = await resolveStripePrice(tier);
    if (resolved?.id === priceId) return tier;
  }
  return "free";
}

async function stripeCustomerForPrincipal(actor, { create = false } = {}) {
  if (!stripe) throw Object.assign(new Error("Stripe is not configured"), { status: 503, code: "BILLING_NOT_CONFIGURED" });
  const overrides = await billingOverrides(actor.gid);
  const storedId = String(overrides?.stripe_customer_id || "").trim();
  if (storedId) {
    const stored = await stripe.customers.retrieve(storedId).catch(() => null);
    if (stored && !stored.deleted) return stored;
  }

  let customer = null;
  if (actor.email) {
    const list = await stripe.customers.list({ email: actor.email, limit: 100 });
    customer = list.data.find((item) => item.metadata?.gid === actor.gid)
      || list.data.find((item) => actor.user_id && item.metadata?.user_id === actor.user_id)
      || list.data[0]
      || null;
  }

  if (!customer && actor.gid) {
    const search = await stripe.customers.search({ query: `metadata['gid']:'${String(actor.gid).replace(/'/g, "")}'`, limit: 10 }).catch(() => null);
    customer = search?.data?.[0] || null;
  }

  if (!customer && create) {
    const metadata = { gid: actor.gid };
    if (actor.user_id) metadata.user_id = actor.user_id;
    customer = await stripe.customers.create({ email: actor.email || undefined, metadata });
  }

  if (customer?.id) {
    await patchBillingOverrides(actor.gid, { stripe_customer_id: customer.id });
  }
  return customer;
}

async function activeSubscription(customerId) {
  if (!stripe || !customerId) return null;
  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const ordered = [...subscriptions.data].sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
  return ordered.find((item) => ["active", "trialing"].includes(normalizedStripeStatus(item.status))) || ordered[0] || null;
}

async function canonicalSubscription(subscription) {
  if (!subscription) return { tier: "free", status: "free", price: null };
  const item = subscription.items?.data?.[0] || null;
  const status = normalizedStripeStatus(subscription.status);
  const metadataTier = publicTier(subscription.metadata?.tier || "");
  const priceTier = item?.price?.id ? await tierFromPrice(item.price.id) : "free";
  const tier = ["active", "trialing"].includes(status) ? (metadataTier !== "free" ? metadataTier : priceTier) : "free";
  return { tier, status, price: item?.price?.id ? await resolveStripePrice(tier) : null };
}

async function handleCatalog(req, res, id) {
  const result = await db().query(
    `select id,name,priority,limits,metadata from public.access_tiers where user_type='external' and enabled=true order by priority,id`,
  );
  const byPublicTier = new Map();
  for (const row of result.rows) {
    const tier = publicTier(row.id);
    if (!PUBLIC_TIERS.includes(tier) || byPublicTier.has(tier)) continue;
    byPublicTier.set(tier, row);
  }

  const tiers = [];
  for (const tier of PUBLIC_TIERS) {
    const row = byPublicTier.get(tier) || null;
    const price = tier === "free" ? null : await resolveStripePrice(tier);
    tiers.push({
      id: tier,
      name: row?.name || (tier === "free" ? "Free" : canonicalProductName(tier)),
      priority: row?.priority ?? PUBLIC_TIERS.indexOf(tier),
      limits: row?.limits || {},
      metadata: row?.metadata || {},
      checkout_configured: tier === "free" ? false : Boolean(price),
      price,
    });
  }

  const paidReady = tiers.filter((tier) => tier.id !== "free").every((tier) => tier.checkout_configured);
  return json(res, 200, {
    ok: true,
    authority: "Stripe + Neon",
    billing_configured: Boolean(stripe) && paidReady,
    pricing_source: "stripe",
    tiers,
  }, id, req);
}

async function handleCheckout(req, res, raw, id) {
  if (!stripe) return json(res, 503, { ok: false, code: "BILLING_NOT_CONFIGURED", error: "Stripe billing is not configured" }, id, req);
  const actor = await billingPrincipal(req);
  if (actor.kind === "owner" || actor.gid === OWNER_GID) {
    return json(res, 400, { ok: false, code: "OWNER_BILLING_NOT_REQUIRED", error: "Owner tier does not require checkout" }, id, req);
  }
  let body = {};
  try { body = raw.length ? JSON.parse(raw.toString("utf8")) : {}; }
  catch { return json(res, 400, { ok: false, code: "INVALID_JSON", error: "Invalid JSON body" }, id, req); }
  const tier = publicTier(body.tier || body.plan || "");
  if (!PAID_TIERS.includes(tier)) {
    return json(res, 400, { ok: false, code: "INVALID_TIER", error: "Paid tier must be personal, pro, business, or enterprise" }, id, req);
  }
  const price = await resolveStripePrice(tier, { refresh: true });
  if (!price) {
    return json(res, 503, { ok: false, code: "PRICE_NOT_CONFIGURED", error: `Stripe recurring price for ${tier} is not configured` }, id, req);
  }
  const customer = await stripeCustomerForPrincipal(actor, { create: true });
  if (!customer?.id) return json(res, 503, { ok: false, code: "CUSTOMER_UNAVAILABLE", error: "Stripe customer could not be resolved" }, id, req);

  const existingSubscription = await activeSubscription(customer.id);
  const existingStatus = normalizedStripeStatus(existingSubscription?.status);
  if (existingSubscription && ["active", "trialing"].includes(existingStatus)) {
    const current = await canonicalSubscription(existingSubscription);
    await syncIdentityTier({
      gid: actor.gid,
      userId: actor.user_id,
      tier: current.tier,
      status: current.status,
      metadata: { stripe_customer_id: customer.id, stripe_subscription_id: existingSubscription.id, source: "checkout-duplicate-guard" },
    });
    return json(res, 409, {
      ok: false,
      code: "ACTIVE_SUBSCRIPTION_EXISTS",
      error: "An active paid subscription already exists; use billing management to change plans",
      gid: actor.gid,
      current_tier: current.tier,
      subscription_status: current.status,
      portal_available: true,
    }, id, req);
  }

  const metadata = { gid: actor.gid, tier };
  if (actor.user_id) metadata.user_id = actor.user_id;
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    ...(actor.user_id ? { client_reference_id: actor.user_id } : {}),
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${PUBLIC_DOMAIN}/?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_DOMAIN}/?checkout=cancel`,
    metadata,
    subscription_data: { metadata },
  });
  await patchBillingOverrides(actor.gid, {
    stripe_customer_id: customer.id,
    checkout_session_id: checkout.id,
    checkout_tier: tier,
    subscription_status: "checkout_pending",
    synchronized_at: new Date().toISOString(),
  });
  return json(res, 200, { ok: true, checkout_required: true, url: checkout.url, session_id: checkout.id, tier, price }, id, req);
}

async function handleStatus(req, res, id) {
  const actor = await billingPrincipal(req);
  if (actor.kind === "owner" || actor.gid === OWNER_GID) {
    return json(res, 200, { ok: true, billing_configured: Boolean(stripe), gid: OWNER_GID, tier: "owner", status: "active", subscription: null }, id, req);
  }
  if (!stripe) return json(res, 200, { ok: true, billing_configured: false, gid: actor.gid, tier: "free", status: "free", subscription: null }, id, req);
  const customer = await stripeCustomerForPrincipal(actor, { create: false });
  if (!customer?.id) return json(res, 200, { ok: true, billing_configured: true, gid: actor.gid, tier: "free", status: "free", subscription: null }, id, req);

  const subscription = await activeSubscription(customer.id);
  if (!subscription) return json(res, 200, { ok: true, billing_configured: true, gid: actor.gid, tier: "free", status: "free", subscription: null }, id, req);
  const canonical = await canonicalSubscription(subscription);
  await syncIdentityTier({
    gid: actor.gid,
    userId: actor.user_id,
    tier: canonical.tier,
    status: canonical.status,
    metadata: { stripe_customer_id: customer.id, stripe_subscription_id: subscription.id, source: "billing-status" },
  });
  const item = subscription.items?.data?.[0] || null;
  return json(res, 200, {
    ok: true,
    billing_configured: true,
    gid: actor.gid,
    tier: canonical.tier,
    status: canonical.status,
    price: canonical.price,
    subscription: {
      id: subscription.id,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      current_period_end: item?.current_period_end || subscription.current_period_end || null,
    },
  }, id, req);
}

async function handleCheckoutSession(req, res, id) {
  if (!stripe) return json(res, 503, { ok: false, code: "BILLING_NOT_CONFIGURED", error: "Stripe billing is not configured" }, id, req);
  const actor = await billingPrincipal(req);
  if (actor.kind === "owner") return json(res, 400, { ok: false, code: "OWNER_BILLING_NOT_REQUIRED", error: "Owner tier does not require checkout reconciliation" }, id, req);
  const sessionId = new URL(req.url || "/", "http://localhost").searchParams.get("session_id")?.trim();
  if (!sessionId) return json(res, 400, { ok: false, code: "SESSION_ID_REQUIRED", error: "session_id is required" }, id, req);

  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription", "customer"] });
  const sessionGid = String(session.metadata?.gid || (typeof session.customer === "object" ? session.customer?.metadata?.gid : "") || "").trim();
  const sessionUser = String(session.metadata?.user_id || session.client_reference_id || "").trim();
  const actorMatches = sessionGid === actor.gid || (actor.user_id && sessionUser === actor.user_id);
  if (!actorMatches) return json(res, 403, { ok: false, code: "CHECKOUT_SESSION_DENIED", error: "Checkout session does not belong to this GID" }, id, req);

  const subscription = typeof session.subscription === "object" && session.subscription
    ? session.subscription
    : session.subscription
      ? await stripe.subscriptions.retrieve(String(session.subscription))
      : null;
  const canonical = await canonicalSubscription(subscription);
  let access = null;
  if (subscription) {
    access = await syncIdentityTier({
      gid: actor.gid,
      userId: actor.user_id,
      tier: canonical.tier,
      status: canonical.status,
      metadata: {
        stripe_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
        stripe_subscription_id: subscription.id,
        checkout_session_id: session.id,
        checkout_payment_status: session.payment_status || null,
        source: "checkout-return",
      },
    });
  }

  return json(res, 200, {
    ok: true,
    gid: actor.gid,
    session_id: session.id,
    checkout_status: session.status || null,
    payment_status: session.payment_status || null,
    tier: canonical.tier,
    status: canonical.status,
    price: canonical.price,
    synchronized: Boolean(access),
    entitlement_refresh_required: true,
  }, id, req);
}

async function handlePortal(req, res, id) {
  if (!stripe) return json(res, 503, { ok: false, code: "BILLING_NOT_CONFIGURED", error: "Stripe billing is not configured" }, id, req);
  const actor = await billingPrincipal(req);
  if (actor.kind === "owner") return json(res, 400, { ok: false, code: "OWNER_BILLING_NOT_REQUIRED", error: "Owner tier does not require a billing portal" }, id, req);
  const customer = await stripeCustomerForPrincipal(actor, { create: false });
  if (!customer?.id) return json(res, 409, { ok: false, code: "CUSTOMER_REQUIRED", error: "No Stripe customer exists for this GID" }, id, req);
  const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: PUBLIC_DOMAIN });
  return json(res, 200, { ok: true, url: portal.url }, id, req);
}

function proxyResponseHeaders(req, upstreamHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(upstreamHeaders || {})) {
    const lower = key.toLowerCase();
    if (lower.startsWith("access-control-") || Object.keys(SECURITY_HEADERS).includes(lower)) continue;
    if (value != null) headers[key] = value;
  }
  return { ...headers, ...SECURITY_HEADERS, ...corsHeaders(req), "x-billing-authority": "stripe-neon-v1" };
}

function proxyStream(req, res) {
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: innerPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${innerPort}` },
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, proxyResponseHeaders(req, upstreamRes.headers));
    upstreamRes.pipe(res);
  });
  upstream.on("error", (error) => {
    const id = requestId(req);
    json(res, 503, { ok: false, code: "RUNTIME_UNAVAILABLE", error: "ARI subscription runtime unavailable", request_id: id }, id, req);
    console.error("Billing gateway upstream error", error);
  });
  req.pipe(upstream);
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

async function handle(req, res) {
  const id = requestId(req);
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  try {
    const origin = originFor(req);
    if (origin === false) return json(res, 403, { ok: false, code: "ORIGIN_DENIED", error: "Origin is not allowed", request_id: id }, id, req);
    if (req.method === "OPTIONS") {
      return json(res, 204, {}, id, req, {
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "authorization,content-type,x-request-id,stripe-signature",
        "access-control-max-age": "600",
      });
    }

    if (req.method === "GET" && pathname === "/api/billing/catalog") return await handleCatalog(req, res, id);
    if (req.method === "GET" && pathname === "/api/billing/status") return await handleStatus(req, res, id);
    if (req.method === "GET" && pathname === "/api/billing/checkout-session") return await handleCheckoutSession(req, res, id);
    if (req.method === "POST" && pathname === "/api/billing/portal") return await handlePortal(req, res, id);
    if (req.method === "POST" && pathname === "/api/billing/checkout") {
      const raw = await readBody(req);
      return await handleCheckout(req, res, raw, id);
    }
    return proxyStream(req, res);
  } catch (error) {
    console.error("ARI billing gateway error", error);
    return json(res, Number(error.status) || 503, {
      ok: false,
      code: error.code || "BILLING_FAILURE",
      error: error.message || "Billing failure",
      request_id: id,
    }, id, req);
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
  .then(() => gateway.listen(outerPort, "0.0.0.0", () => console.log(`ARI billing gateway ${outerPort}; inner subscription authority ${innerPort}; stripe=${Boolean(stripe)}`)))
  .catch((error) => {
    console.error(`ARI subscription authority failed readiness: ${error.message}`);
    if (!child.killed) child.kill("SIGTERM");
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`ARI billing gateway received ${signal}`);
  gateway.close(async () => {
    if (!child.killed) child.kill("SIGTERM");
    try { await pool?.end(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
