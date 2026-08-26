import crypto from 'node:crypto';
import fs from 'node:fs';

const ARI = String(process.env.ARI || 'https://ari-689058655022.us-west1.run.app').replace(/\/$/, '');
const OUTPUT = process.env.DEVICE_PROOF_OUTPUT || 'DEVICE_FABRIC_RELEASE_PROOF.json';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cookieFrom(response) {
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  const session = values.map((value) => String(value).split(';')[0]).find((value) => value.startsWith('ari_session='));
  return session || '';
}

async function call(path, { method = 'GET', cookie = '', body = undefined, expected = 200, requestId = crypto.randomUUID() } = {}) {
  const response = await fetch(`${ARI}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      'x-request-id': requestId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (response.status !== expected) {
    throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 600)}`);
  }
  return { response, payload, cookie: cookieFrom(response) };
}

function proofPayload({ gid, deviceId, timestamp, nonce, requestId, capability }) {
  return ['SIOS-DEVICE-REQUEST', 'v1', gid, deviceId, String(timestamp), nonce, requestId, capability].join('\n');
}

function sign(privateKey, payload) {
  return crypto.sign('sha256', Buffer.from(payload, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}

async function createSession() {
  const guest = await call('/api/identity/guest', { method: 'POST', body: {}, expected: 201 });
  assert(/^\d{12}$/.test(String(guest.payload?.gid || '')), 'guest identity did not return a 12-digit GID');
  assert(guest.cookie, 'guest identity did not issue ari_session cookie');
  return { gid: String(guest.payload.gid), cookie: guest.cookie };
}

const primary = await createSession();
const secondary = await createSession();
assert(primary.gid !== secondary.gid, 'isolation proof requires distinct GIDs');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = publicKey.export({ format: 'jwk' });

const started = await call('/api/devices/enroll/start', {
  method: 'POST',
  cookie: primary.cookie,
  expected: 201,
  body: {
    name: 'THOTH GA PROOF DEVICE',
    type: 'pwa',
    public_key_jwk: publicJwk,
    transport: 'https',
    metadata: { source: 'ga-release-proof' },
  },
});
assert(started.payload?.trust_state === 'pending', 'enrollment did not enter pending state');
const deviceId = String(started.payload.device_id || '');
assert(deviceId, 'enrollment did not issue device_id');

const enrollmentSignature = sign(privateKey, String(started.payload.challenge_payload || ''));
const verified = await call('/api/devices/enroll/verify', {
  method: 'POST',
  cookie: primary.cookie,
  body: {
    device_id: deviceId,
    challenge_id: started.payload.challenge_id,
    signature: enrollmentSignature,
  },
});
assert(verified.payload?.device?.trust_state === 'verified', 'device did not become verified');
assert(Array.isArray(verified.payload?.device?.capabilities) && verified.payload.device.capabilities.length === 0, 'new device did not default to deny/no grants');

await call('/api/devices/enroll/verify', {
  method: 'POST',
  cookie: primary.cookie,
  body: {
    device_id: deviceId,
    challenge_id: started.payload.challenge_id,
    signature: enrollmentSignature,
  },
  expected: 409,
});

await call(`/api/devices/${deviceId}`, { cookie: secondary.cookie, expected: 404 });

function makeProof(capability, privateKeyValue = privateKey) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(24).toString('base64url');
  const requestId = crypto.randomUUID();
  const payload = proofPayload({ gid: primary.gid, deviceId, timestamp, nonce, requestId, capability });
  return { capability, timestamp, nonce, request_id: requestId, signature: sign(privateKeyValue, payload) };
}

await call(`/api/devices/${deviceId}/proof`, {
  method: 'POST',
  cookie: primary.cookie,
  body: makeProof('private_sync'),
  expected: 403,
});

const granted = await call(`/api/devices/${deviceId}/grants`, {
  method: 'POST',
  cookie: primary.cookie,
  body: { grant: ['private_sync'], revoke: [] },
});
assert(granted.payload?.device?.capabilities?.includes('private_sync'), 'private_sync grant was not persisted');

const validProof = makeProof('private_sync');
const proved = await call(`/api/devices/${deviceId}/proof`, {
  method: 'POST',
  cookie: primary.cookie,
  body: validProof,
});
assert(proved.payload?.proof?.verified === true, 'signed device proof was not verified');

await call(`/api/devices/${deviceId}/proof`, {
  method: 'POST',
  cookie: primary.cookie,
  body: validProof,
  expected: 409,
});

const { privateKey: attackerKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
await call(`/api/devices/${deviceId}/proof`, {
  method: 'POST',
  cookie: primary.cookie,
  body: makeProof('private_sync', attackerKey),
  expected: 403,
});

const revoked = await call(`/api/devices/${deviceId}/revoke`, {
  method: 'POST',
  cookie: primary.cookie,
  body: { reason: 'GA proof revocation' },
});
assert(revoked.payload?.device?.trust_state === 'revoked', 'device was not revoked');
assert(revoked.payload?.device?.capabilities?.length === 0, 'revocation did not clear grants');

await call(`/api/devices/${deviceId}/proof`, {
  method: 'POST',
  cookie: primary.cookie,
  body: makeProof('private_sync'),
  expected: 403,
});

const listed = await call('/api/devices', { cookie: primary.cookie });
const finalDevice = listed.payload?.devices?.find((entry) => entry.device_id === deviceId);
assert(finalDevice?.trust_state === 'revoked', 'revoked state was not durable');

const evidence = {
  ok: true,
  verified_at: new Date().toISOString(),
  endpoint: ARI,
  checks: {
    gid_isolation: true,
    cryptographic_enrollment: true,
    enrollment_replay_rejected: true,
    default_deny_grants: true,
    explicit_grant: true,
    signed_device_proof: true,
    request_replay_rejected: true,
    bad_signature_rejected: true,
    revocation: true,
    revoked_device_rejected: true,
  },
};
fs.writeFileSync(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
