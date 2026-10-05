// Live tenant-isolation proof against a running ARI edge (local CI chain or production).
// Env: ARI (base URL, required), OWNER_ACCESS_CODE (optional), SUPABASE_URL + SUPABASE_ANON_KEY (optional, enables member metadata-spoof proof).
import crypto from "node:crypto";

const ARI = String(process.env.ARI || "").replace(/\/$/, "");
if (!ARI) throw new Error("ARI base URL is required");
const OWNER_GID = "399152573423";
const results = [];

function check(name, condition, detail = "") {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(path, { method = "GET", body, cookie, bearer, headers = {}, stream = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), stream ? 4000 : 60000);
  try {
    const response = await fetch(ARI + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (stream) {
      const contentType = response.headers.get("content-type") || "";
      controller.abort();
      return { status: response.status, contentType };
    }
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
    return { status: response.status, json, setCookie: response.headers.getSetCookie?.() || [] };
  } finally {
    clearTimeout(timer);
  }
}

function sessionCookie(setCookie) {
  const raw = setCookie.find((c) => c.startsWith("ari_session="));
  return raw ? raw.split(";")[0] : null;
}

async function guest(label) {
  const r = await call("/api/identity/guest", { method: "POST", body: {} });
  const cookie = sessionCookie(r.setCookie);
  check(`${label}: guest session minted`, r.status === 201 && cookie && /^\d{12}$/.test(String(r.json?.gid)), `status ${r.status}`);
  check(`${label}: guest GID is not the owner GID`, r.json?.gid !== OWNER_GID);
  return { label, cookie, gid: String(r.json?.gid || "") };
}

async function createExecution(tenant) {
  const r = await call("/api/runtime/executions", {
    method: "POST",
    cookie: tenant.cookie,
    body: { capability: "tae", intent: `tenant isolation probe for ${tenant.label}`, request_id: `iso-${crypto.randomUUID()}` },
  });
  const id = r.json?.execution?.id;
  check(`${tenant.label}: create execution`, r.status === 202 && id && r.json?.execution?.gid === tenant.gid, `status ${r.status} ${r.status >= 400 ? JSON.stringify(r.json).slice(0, 200) : ""}`);
  return id;
}

async function proveIsolation(owner, intruder, executionId) {
  const tag = `${intruder.label} -> ${owner.label}`;
  const get = await call(`/api/runtime/executions/${executionId}`, { cookie: intruder.cookie });
  check(`${tag}: GET foreign execution denied`, get.status === 404, `status ${get.status}`);
  const events = await call(`/api/runtime/executions/${executionId}/events`, { cookie: intruder.cookie, stream: true });
  check(`${tag}: events stream of foreign execution denied`, events.status === 404, `status ${events.status}`);
  const cancel = await call(`/api/runtime/executions/${executionId}/cancel`, { method: "POST", cookie: intruder.cookie, body: {} });
  check(`${tag}: cancel foreign execution denied`, cancel.status === 404, `status ${cancel.status}`);
  const list = await call("/api/runtime/executions", { cookie: intruder.cookie });
  const ids = (list.json?.executions || []).map((e) => e.id);
  check(`${tag}: list excludes foreign execution`, list.status === 200 && !ids.includes(executionId) && (list.json?.executions || []).every((e) => e.gid === intruder.gid), `status ${list.status}`);

  const own = await call(`/api/runtime/executions/${executionId}`, { cookie: owner.cookie });
  check(`${owner.label}: GET own execution`, own.status === 200 && own.json?.execution?.gid === owner.gid, `status ${own.status} state ${own.json?.execution?.state}`);
  const ownList = await call("/api/runtime/executions", { cookie: owner.cookie });
  check(`${owner.label}: list includes own execution`, (ownList.json?.executions || []).some((e) => e.id === executionId), `status ${ownList.status}`);
  const ownEvents = await call(`/api/runtime/executions/${executionId}/events`, { cookie: owner.cookie, stream: true });
  check(`${owner.label}: events stream of own execution`, ownEvents.status === 200 && ownEvents.contentType.includes("text/event-stream"), `status ${ownEvents.status}`);
}

// Anonymous boundary.
for (const [method, path, body] of [
  ["POST", "/api/runtime/executions", { intent: "anon" }],
  ["GET", "/api/runtime/executions", undefined],
  ["POST", "/api/runtime", { intent: "anon", capability: "scribe" }],
  ["POST", "/api/tae", { prompt: "anon" }],
  ["POST", "/api/render-state", { state: "speaking" }],
  ["POST", "/api/syncori", { state: "speaking" }],
]) {
  const r = await call(path, { method, body });
  check(`anonymous ${method} ${path} rejected`, r.status === 401, `status ${r.status}`);
}
const anonIdentity = await call("/api/identity");
check("anonymous identity does not disclose owner GID", anonIdentity.json?.gid !== OWNER_GID && anonIdentity.json?.authenticated !== true, `gid ${anonIdentity.json?.gid}`);

// Owner credential boundary.
const ownerGidOnly = await call("/api/identity/authorize", { method: "POST", body: { gid: OWNER_GID } });
check("owner GID-only login rejected", ownerGidOnly.status === 401, `status ${ownerGidOnly.status}`);
const ownerForged = await call("/api/identity/authorize", { method: "POST", body: { gid: OWNER_GID }, headers: { "x-ari-internal-authorize": "forged" } });
check("owner login with forged internal header rejected", ownerForged.status === 401, `status ${ownerForged.status}`);
const ownerWrong = await call("/api/identity/authorize", { method: "POST", body: { gid: OWNER_GID, password: "definitely-not-the-owner-code" } });
check("owner login with wrong access code rejected", ownerWrong.status === 401, `status ${ownerWrong.status}`);
if (process.env.OWNER_ACCESS_CODE) {
  const ok = await call("/api/identity/authorize", { method: "POST", body: { gid: OWNER_GID, password: process.env.OWNER_ACCESS_CODE } });
  const cookie = sessionCookie(ok.setCookie);
  const who = cookie ? await call("/api/identity", { cookie }) : { json: null };
  check("owner login with access code authorized", ok.status === 200 && who.json?.gid === OWNER_GID, `status ${ok.status}`);
}

// Guest tenants A/B, both directions.
const A = await guest("Tenant A");
const B = await guest("Tenant B");
check("tenants have distinct GIDs", A.gid && B.gid && A.gid !== B.gid);
const forged = `ari_session=${encodeURIComponent(`${A.gid}.${Math.floor(Date.now() / 1000) + 3600}.forged`)}`;
const forgedRead = await call("/api/runtime/executions", { cookie: forged });
check("forged session cookie rejected", forgedRead.status === 401, `status ${forgedRead.status}`);

const execA = await createExecution(A);
const execB = await createExecution(B);
if (execA) await proveIsolation(A, B, execA);
if (execB) await proveIsolation(B, A, execB);

// Member metadata spoof: a user must not be able to claim another tenant's GID via user-editable user_metadata.
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && execA) {
  const email = `iso-${crypto.randomUUID()}@example.com`;
  const password = `Iso-${crypto.randomUUID()}`;
  const signup = await call("/api/auth/signup", { method: "POST", body: { email, password, display_name: "Isolation Probe" } });
  check("member signup", signup.status >= 200 && signup.status < 300, `status ${signup.status} ${signup.status >= 300 ? JSON.stringify(signup.json).slice(0, 200) : ""}`);
  const login = await call("/api/auth/login", { method: "POST", body: { email, password } });
  const token = login.json?.access_token;
  check("member login", login.status === 200 && token, `status ${login.status}`);
  if (token) {
    const supabase = String(process.env.SUPABASE_URL).replace(/\/$/, "");
    const spoof = await fetch(`${supabase}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ data: { gid: A.gid } }),
    });
    check("member can self-edit user_metadata (attack precondition)", spoof.ok, `status ${spoof.status}`);
    const relogin = await call("/api/auth/login", { method: "POST", body: { email, password } });
    const spoofToken = relogin.json?.access_token || token;
    const who = await call("/api/identity", { bearer: spoofToken });
    check("spoofed user_metadata.gid does not grant Tenant A identity", who.json?.gid !== A.gid, `gid ${who.json?.gid}`);
    const read = await call(`/api/runtime/executions/${execA}`, { bearer: spoofToken });
    check("spoofed member cannot read Tenant A execution", read.status === 404 || read.status === 401 || read.status === 403, `status ${read.status}`);
    const list = await call("/api/runtime/executions", { bearer: spoofToken });
    check("spoofed member list excludes Tenant A executions", !(list.json?.executions || []).some((e) => e.gid === A.gid), `status ${list.status}`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\nTenant isolation: ${results.length - failed.length}/${results.length} checks passed against ${ARI}`);
if (failed.length) process.exit(1);
