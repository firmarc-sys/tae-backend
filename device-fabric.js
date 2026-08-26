import crypto from "node:crypto";

const DEVICE_CAPABILITIES = new Set([
  "camera",
  "microphone",
  "notifications",
  "private_sync",
  "files",
  "gpu_compute",
  "local_apps",
  "remote_compute",
  "storage",
  "lan_access",
  "shell",
  "iot",
  "xr",
]);
const DEVICE_TYPES = new Set(["pwa", "full"]);
const TRANSPORTS = new Set(["https", "websocket", "webrtc", "tailscale", "wireguard", "native"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;
const REQUEST_RE = /^[A-Za-z0-9._:-]{8,200}$/;
const ENROLLMENT_TTL_MS = 5 * 60 * 1000;
const PROOF_MAX_SKEW_MS = 5 * 60 * 1000;

function problem(message, status = 400, code = "INVALID_REQUEST") {
  return Object.assign(new Error(message), { status, code });
}

function parseJson(raw) {
  try {
    const body = raw?.length ? JSON.parse(raw.toString("utf8")) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("body must be an object");
    return body;
  } catch (error) {
    throw problem(error?.message === "body must be an object" ? error.message : "Invalid JSON body", 400, "INVALID_JSON");
  }
}

function rejectUnknown(body, allowed) {
  const extras = Object.keys(body).filter((key) => !allowed.has(key));
  if (extras.length) throw problem(`Unknown field(s): ${extras.join(", ")}`, 400, "UNKNOWN_FIELD");
}

function text(value, label, { min = 1, max = 200, pattern = null } = {}) {
  const result = String(value ?? "").trim();
  if (result.length < min || result.length > max || (pattern && !pattern.test(result))) {
    throw problem(`${label} is invalid`, 400, "VALIDATION_ERROR");
  }
  return result;
}

function cleanMetadata(value) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw problem("metadata must be an object", 400, "VALIDATION_ERROR");
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 8192) throw problem("metadata is too large", 413, "PAYLOAD_TOO_LARGE");
  return JSON.parse(serialized);
}

function publicJwk(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw problem("public_key_jwk is required", 400, "VALIDATION_ERROR");
  if (value.d) throw problem("Private key material must never be sent to ARI", 400, "PRIVATE_KEY_REJECTED");
  if (value.kty !== "EC" || value.crv !== "P-256") throw problem("Only ECDSA P-256 device keys are accepted", 400, "UNSUPPORTED_DEVICE_KEY");
  if (typeof value.x !== "string" || typeof value.y !== "string" || !TOKEN_RE.test(value.x) || !TOKEN_RE.test(value.y)) {
    throw problem("public_key_jwk coordinates are invalid", 400, "VALIDATION_ERROR");
  }
  return { kty: "EC", crv: "P-256", x: value.x, y: value.y, ext: true, key_ops: ["verify"] };
}

function signatureBuffer(value) {
  const encoded = text(value, "signature", { min: 40, max: 256, pattern: /^[A-Za-z0-9_-]+$/ });
  const buffer = Buffer.from(encoded, "base64url");
  if (buffer.length !== 64) throw problem("signature must be an ECDSA P-256 IEEE-P1363 signature", 400, "INVALID_SIGNATURE");
  return buffer;
}

function verifySignature(jwk, payload, signature) {
  try {
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    return crypto.verify("sha256", Buffer.from(payload, "utf8"), { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch {
    return false;
  }
}

function enrollmentPayload({ gid, deviceId, challenge, expiresAt }) {
  return ["SIOS-DEVICE-ENROLL", "v1", gid, deviceId, challenge, expiresAt.toISOString()].join("\n");
}

export function deviceProofPayload({ gid, deviceId, timestamp, nonce, requestId, capability }) {
  return ["SIOS-DEVICE-REQUEST", "v1", gid, deviceId, String(timestamp), nonce, requestId, capability].join("\n");
}

async function audit(db, { gid, deviceId = null, eventType, outcome = "success", requestId = null, details = {} }) {
  await db().query(
    `insert into public.device_audit_events (gid,device_id,event_type,outcome,request_id,details)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [gid, deviceId, eventType, outcome, requestId, JSON.stringify(details || {})],
  );
}

async function deviceWithGrants(db, gid, deviceId) {
  const result = await db().query(
    `select d.device_id::text,d.gid,d.name,d.node_type,d.trust_state,d.transport,d.metadata,
            d.created_at,d.verified_at,d.last_seen_at,d.revoked_at,
            coalesce(array_agg(g.capability order by g.capability) filter (where g.capability is not null),'{}') as capabilities
       from public.jahorin_devices d
       left join public.device_grants g on g.device_id=d.device_id and g.gid=d.gid
      where d.gid=$1 and d.device_id=$2::uuid
      group by d.device_id
      limit 1`,
    [gid, deviceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    device_id: row.device_id,
    gid: row.gid,
    name: row.name,
    type: row.node_type,
    trust_state: row.trust_state,
    transport: row.transport,
    metadata: row.metadata || {},
    capabilities: row.capabilities || [],
    created_at: row.created_at,
    verified_at: row.verified_at,
    last_seen_at: row.last_seen_at,
    revoked_at: row.revoked_at,
  };
}

export async function ensureDeviceFabricSchema(db) {
  const client = db();
  await client.query(`
    create table if not exists public.jahorin_devices (
      device_id uuid primary key,
      gid text not null,
      name text not null,
      node_type text not null check (node_type in ('pwa','full')),
      public_key_jwk jsonb not null,
      trust_state text not null default 'pending' check (trust_state in ('pending','verified','revoked')),
      transport text not null default 'https',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      verified_at timestamptz,
      last_seen_at timestamptz,
      revoked_at timestamptz
    );
    create index if not exists jahorin_devices_gid_idx on public.jahorin_devices(gid,created_at desc);

    create table if not exists public.device_enrollment_challenges (
      challenge_id uuid primary key,
      device_id uuid not null references public.jahorin_devices(device_id) on delete cascade,
      gid text not null,
      challenge text not null,
      challenge_payload text not null,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists device_enrollment_gid_idx on public.device_enrollment_challenges(gid,created_at desc);

    create table if not exists public.device_grants (
      gid text not null,
      device_id uuid not null references public.jahorin_devices(device_id) on delete cascade,
      capability text not null,
      granted_at timestamptz not null default now(),
      primary key (gid,device_id,capability)
    );

    create table if not exists public.device_nonces (
      device_id uuid not null references public.jahorin_devices(device_id) on delete cascade,
      nonce text not null,
      request_id text not null,
      used_at timestamptz not null default now(),
      expires_at timestamptz not null,
      primary key (device_id,nonce),
      unique (device_id,request_id)
    );

    create table if not exists public.device_audit_events (
      id bigserial primary key,
      gid text not null,
      device_id uuid,
      event_type text not null,
      outcome text not null,
      request_id text,
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists device_audit_gid_idx on public.device_audit_events(gid,created_at desc);

    create table if not exists public.api_rate_limits (
      bucket_key text not null,
      route_class text not null,
      window_start timestamptz not null,
      count integer not null default 0,
      primary key (bucket_key,route_class,window_start)
    );
  `);
}

export async function enforceDistributedRateLimit(db, { bucketKey, routeClass, limit, windowSeconds = 60 }) {
  const now = Date.now();
  const windowMs = Math.max(1, Number(windowSeconds)) * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const result = await db().query(
    `insert into public.api_rate_limits (bucket_key,route_class,window_start,count)
     values ($1,$2,$3,1)
     on conflict (bucket_key,route_class,window_start)
     do update set count=public.api_rate_limits.count+1
     returning count`,
    [bucketKey, routeClass, windowStart],
  );
  const count = Number(result.rows[0]?.count || 1);
  if (Math.random() < 0.01) {
    db().query(`delete from public.api_rate_limits where window_start < now() - interval '1 day'`).catch(() => {});
  }
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfter: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
  };
}

export function isDeviceRoute(pathname) {
  return pathname === "/api/devices" || pathname.startsWith("/api/devices/") || pathname === "/api/device-fabric";
}

export async function handleDeviceRoute({ req, res, raw, pathname, id, db, sessionGid, json }) {
  const gid = sessionGid(req);
  if (!gid) throw problem("Authenticated ARI session required", 401, "AUTH_REQUIRED");

  if (req.method === "GET" && pathname === "/api/device-fabric") {
    return json(res, 200, {
      ok: true,
      gid,
      isolation: "gid-scoped",
      authority: "ARI",
      default_policy: "deny",
      transports: [...TRANSPORTS],
      node_types: [...DEVICE_TYPES],
      capabilities: [...DEVICE_CAPABILITIES],
    }, id);
  }

  if (req.method === "POST" && pathname === "/api/devices/enroll/start") {
    const body = parseJson(raw);
    rejectUnknown(body, new Set(["name", "type", "public_key_jwk", "transport", "metadata"]));
    const name = text(body.name, "name", { min: 1, max: 80 });
    const nodeType = text(body.type || "pwa", "type", { max: 16 });
    if (!DEVICE_TYPES.has(nodeType)) throw problem("Unsupported device type", 400, "VALIDATION_ERROR");
    const transport = text(body.transport || "https", "transport", { max: 24 });
    if (!TRANSPORTS.has(transport)) throw problem("Unsupported transport", 400, "VALIDATION_ERROR");
    const jwk = publicJwk(body.public_key_jwk);
    const metadata = cleanMetadata(body.metadata);
    const deviceId = crypto.randomUUID();
    const challengeId = crypto.randomUUID();
    const challenge = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MS);
    const payload = enrollmentPayload({ gid, deviceId, challenge, expiresAt });

    const client = await db().connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into public.jahorin_devices (device_id,gid,name,node_type,public_key_jwk,trust_state,transport,metadata)
         values ($1::uuid,$2,$3,$4,$5::jsonb,'pending',$6,$7::jsonb)`,
        [deviceId, gid, name, nodeType, JSON.stringify(jwk), transport, JSON.stringify(metadata)],
      );
      await client.query(
        `insert into public.device_enrollment_challenges (challenge_id,device_id,gid,challenge,challenge_payload,expires_at)
         values ($1::uuid,$2::uuid,$3,$4,$5,$6)`,
        [challengeId, deviceId, gid, challenge, payload, expiresAt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await audit(db, { gid, deviceId, eventType: "device.enrollment_started", requestId: id, details: { type: nodeType, transport } });
    return json(res, 201, {
      ok: true,
      status: "accepted",
      device_id: deviceId,
      challenge_id: challengeId,
      challenge_payload: payload,
      expires_at: expiresAt.toISOString(),
      trust_state: "pending",
    }, id);
  }

  if (req.method === "POST" && pathname === "/api/devices/enroll/verify") {
    const body = parseJson(raw);
    rejectUnknown(body, new Set(["device_id", "challenge_id", "signature"]));
    const deviceId = text(body.device_id, "device_id", { max: 36, pattern: UUID_RE });
    const challengeId = text(body.challenge_id, "challenge_id", { max: 36, pattern: UUID_RE });
    const signature = signatureBuffer(body.signature);
    const result = await db().query(
      `select c.challenge_id::text,c.challenge_payload,c.expires_at,c.used_at,d.public_key_jwk,d.trust_state
         from public.device_enrollment_challenges c
         join public.jahorin_devices d on d.device_id=c.device_id
        where c.challenge_id=$1::uuid and c.device_id=$2::uuid and c.gid=$3 and d.gid=$3
        limit 1`,
      [challengeId, deviceId, gid],
    );
    const row = result.rows[0];
    if (!row) throw problem("Enrollment challenge not found", 404, "ENROLLMENT_NOT_FOUND");
    if (row.trust_state === "revoked") throw problem("Device is revoked", 403, "DEVICE_REVOKED");
    if (row.used_at) throw problem("Enrollment challenge has already been used", 409, "REPLAY_REJECTED");
    if (new Date(row.expires_at).getTime() <= Date.now()) throw problem("Enrollment challenge expired", 410, "CHALLENGE_EXPIRED");
    if (!verifySignature(row.public_key_jwk, row.challenge_payload, signature)) {
      await audit(db, { gid, deviceId, eventType: "device.signature_failed", outcome: "denied", requestId: id, details: { phase: "enrollment" } });
      throw problem("Device signature verification failed", 403, "DEVICE_SIGNATURE_INVALID");
    }
    const client = await db().connect();
    try {
      await client.query("begin");
      const claimed = await client.query(
        `update public.device_enrollment_challenges set used_at=now()
          where challenge_id=$1::uuid and device_id=$2::uuid and gid=$3 and used_at is null and expires_at>now()
          returning challenge_id`,
        [challengeId, deviceId, gid],
      );
      if (!claimed.rowCount) throw problem("Enrollment challenge is no longer valid", 409, "REPLAY_REJECTED");
      await client.query(
        `update public.jahorin_devices set trust_state='verified',verified_at=coalesce(verified_at,now()),last_seen_at=now(),revoked_at=null
          where device_id=$1::uuid and gid=$2 and trust_state<>'revoked'`,
        [deviceId, gid],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await audit(db, { gid, deviceId, eventType: "device.verified", requestId: id });
    return json(res, 200, { ok: true, status: "completed", device: await deviceWithGrants(db, gid, deviceId) }, id);
  }

  if (req.method === "GET" && pathname === "/api/devices") {
    const result = await db().query(`select device_id::text from public.jahorin_devices where gid=$1 order by created_at desc`, [gid]);
    const devices = [];
    for (const row of result.rows) devices.push(await deviceWithGrants(db, gid, row.device_id));
    return json(res, 200, { ok: true, gid, private_domain: `gid:${gid}`, devices }, id);
  }

  const match = pathname.match(/^\/api\/devices\/([0-9a-f-]{36})(?:\/(revoke|grants|proof))?$/i);
  if (!match || !UUID_RE.test(match[1])) throw problem("Device route not found", 404, "NOT_FOUND");
  const deviceId = match[1];
  const action = match[2] || null;
  const device = await deviceWithGrants(db, gid, deviceId);
  if (!device) throw problem("Device not found", 404, "DEVICE_NOT_FOUND");

  if (req.method === "GET" && !action) return json(res, 200, { ok: true, device }, id);

  if (req.method === "POST" && action === "revoke") {
    const body = parseJson(raw);
    rejectUnknown(body, new Set(["reason"]));
    const reason = body.reason == null ? null : text(body.reason, "reason", { max: 160 });
    if (device.trust_state !== "revoked") {
      const client = await db().connect();
      try {
        await client.query("begin");
        await client.query(`update public.jahorin_devices set trust_state='revoked',revoked_at=now() where gid=$1 and device_id=$2::uuid`, [gid, deviceId]);
        await client.query(`delete from public.device_grants where gid=$1 and device_id=$2::uuid`, [gid, deviceId]);
        await client.query(`delete from public.device_enrollment_challenges where gid=$1 and device_id=$2::uuid and used_at is null`, [gid, deviceId]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      await audit(db, { gid, deviceId, eventType: "device.revoked", requestId: id, details: reason ? { reason } : {} });
    }
    return json(res, 200, { ok: true, status: "completed", device: await deviceWithGrants(db, gid, deviceId) }, id);
  }

  if (req.method === "POST" && action === "grants") {
    if (device.trust_state !== "verified") throw problem("Only verified devices can receive grants", 403, "DEVICE_NOT_VERIFIED");
    const body = parseJson(raw);
    rejectUnknown(body, new Set(["grant", "revoke"]));
    const grant = Array.isArray(body.grant) ? [...new Set(body.grant.map((value) => String(value).trim().toLowerCase()))] : [];
    const revoke = Array.isArray(body.revoke) ? [...new Set(body.revoke.map((value) => String(value).trim().toLowerCase()))] : [];
    for (const capability of [...grant, ...revoke]) {
      if (!DEVICE_CAPABILITIES.has(capability)) throw problem(`Unsupported device capability: ${capability}`, 400, "VALIDATION_ERROR");
    }
    const client = await db().connect();
    try {
      await client.query("begin");
      for (const capability of grant) {
        await client.query(`insert into public.device_grants (gid,device_id,capability) values ($1,$2::uuid,$3) on conflict do nothing`, [gid, deviceId, capability]);
      }
      for (const capability of revoke) {
        await client.query(`delete from public.device_grants where gid=$1 and device_id=$2::uuid and capability=$3`, [gid, deviceId, capability]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    if (grant.length) await audit(db, { gid, deviceId, eventType: "device.grant_added", requestId: id, details: { capabilities: grant } });
    if (revoke.length) await audit(db, { gid, deviceId, eventType: "device.grant_removed", requestId: id, details: { capabilities: revoke } });
    return json(res, 200, { ok: true, status: "completed", device: await deviceWithGrants(db, gid, deviceId) }, id);
  }

  if (req.method === "POST" && action === "proof") {
    if (device.trust_state === "revoked") throw problem("Device is revoked", 403, "DEVICE_REVOKED");
    if (device.trust_state !== "verified") throw problem("Device is not verified", 403, "DEVICE_NOT_VERIFIED");
    const body = parseJson(raw);
    rejectUnknown(body, new Set(["capability", "timestamp", "nonce", "request_id", "signature"]));
    const capability = text(body.capability, "capability", { max: 64 }).toLowerCase();
    if (!DEVICE_CAPABILITIES.has(capability)) throw problem("Unsupported device capability", 400, "VALIDATION_ERROR");
    if (!device.capabilities.includes(capability)) throw problem("Device capability has not been granted", 403, "DEVICE_CAPABILITY_REQUIRED");
    const timestamp = Number(body.timestamp);
    if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > PROOF_MAX_SKEW_MS) throw problem("Device proof timestamp is stale or invalid", 410, "PROOF_EXPIRED");
    const nonce = text(body.nonce, "nonce", { max: 256, pattern: TOKEN_RE });
    const requestId = text(body.request_id, "request_id", { max: 200, pattern: REQUEST_RE });
    const signature = signatureBuffer(body.signature);
    const keyResult = await db().query(`select public_key_jwk from public.jahorin_devices where gid=$1 and device_id=$2::uuid and trust_state='verified' limit 1`, [gid, deviceId]);
    const jwk = keyResult.rows[0]?.public_key_jwk;
    const payload = deviceProofPayload({ gid, deviceId, timestamp, nonce, requestId, capability });
    if (!jwk || !verifySignature(jwk, payload, signature)) {
      await audit(db, { gid, deviceId, eventType: "device.signature_failed", outcome: "denied", requestId, details: { phase: "request", capability } });
      throw problem("Device signature verification failed", 403, "DEVICE_SIGNATURE_INVALID");
    }
    try {
      await db().query(
        `insert into public.device_nonces (device_id,nonce,request_id,expires_at)
         values ($1::uuid,$2,$3,now()+interval '10 minutes')`,
        [deviceId, nonce, requestId],
      );
    } catch (error) {
      if (error?.code === "23505") {
        await audit(db, { gid, deviceId, eventType: "device.replay_rejected", outcome: "denied", requestId, details: { capability } });
        throw problem("Device proof has already been used", 409, "REPLAY_REJECTED");
      }
      throw error;
    }
    await db().query(`update public.jahorin_devices set last_seen_at=now() where gid=$1 and device_id=$2::uuid`, [gid, deviceId]);
    await audit(db, { gid, deviceId, eventType: "device.proof_verified", requestId, details: { capability } });
    if (Math.random() < 0.05) db().query(`delete from public.device_nonces where expires_at<now()`).catch(() => {});
    return json(res, 200, { ok: true, status: "completed", proof: { gid, device_id: deviceId, capability, request_id: requestId, verified: true } }, id);
  }

  throw problem("Method not allowed", 405, "METHOD_NOT_ALLOWED");
}
