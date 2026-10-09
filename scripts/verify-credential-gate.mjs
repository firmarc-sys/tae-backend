import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const edge = fs.readFileSync('credential-gateway.js', 'utf8');
assert.equal(pkg.scripts?.start, 'node credential-gateway.js');
assert(!edge.includes('OWNER_GID'), 'No owner credential exemption is permitted');
assert(edge.includes('owner_access: "credential-required"'));
assert(edge.indexOf('pathname === "/api/identity/authorize"') < edge.indexOf('return proxyStream(req, res)'));
assert(edge.indexOf('await waitForInnerChainReady();') < edge.indexOf('innerJson("/api/identity/authorize"'));

// Execute the actual credential functions with isolated dependencies. No live
// database, owner session, external auth service or child process is used.
function sourceFunction(name) {
  const start = edge.indexOf(`async function ${name}(`);
  assert(start >= 0, `Missing ${name}`);
  const end = edge.indexOf('\n}\n', start);
  assert(end > start);
  return edge.slice(start, end + 2);
}
let count = 0;
async function authorize(body, options = {}) {
  const calls = [];
  const ctx = vm.createContext({
    checkAuthRate: () => {},
    readBody: async () => body,
    json: (_req, _res, status, payload) => ({ status, payload }),
    db: () => ({ query: async (_sql, params) => {
      calls.push(['binding', params[0]]);
      return { rows: options.rows ?? [{ auth_user_id: 'bound-user', status: 'active' }] };
    }}),
    supabaseAdminUser: async () => ({ id: 'bound-user', email: 'test@example.invalid' }),
    innerJson: async (path, args) => {
      calls.push([path, args.body]);
      if (options.unavailable) throw new Error('credential authority unavailable');
      return { response: { ok: !options.wrongPassword }, payload: { user: {
        id: options.wrongUser ? 'different-user' : 'bound-user',
        user_metadata: { gid: 'user-editable-value' },
      } } };
    },
    mintInnerSession: async (_req, _res, gid) => {
      calls.push(['mint', gid]);
      return { status: 200, payload: { authenticated: true } };
    },
  });
  vm.runInContext(['authBindingForGid', 'verifyMemberPassword', 'handleAuthorize'].map(sourceFunction).join('\n'), ctx);
  try {
    const result = await ctx.handleAuthorize({}, {});
    return { ...result, calls };
  } catch (error) { return { error, calls }; }
}
for (const gid of ['399152573423', '123456789012']) {
  for (const password of [undefined, '', null, 123, {}]) {
    const result = await authorize({ gid, password });
    assert.equal(result.status, 400);
    assert.equal(result.payload.code, 'CREDENTIAL_REQUIRED');
    assert.equal(result.calls.length, 0, 'Missing/invalid proof must not reach any authority');
    count++;
  }
  for (const options of [
    { wrongPassword: true }, { wrongUser: true }, { rows: [] },
    { rows: [{ auth_user_id: 'bound-user', status: 'disabled' }] },
    { rows: [{ status: 'active' }] },
  ]) {
    const result = await authorize({ gid, password: 'test-proof' }, options);
    assert.equal(result.status, 401);
    assert(!result.calls.some(([kind]) => kind === 'mint'));
    count++;
  }
  const outage = await authorize({ gid, password: 'test-proof' }, { unavailable: true });
  assert(outage.error);
  assert(!outage.calls.some(([kind]) => kind === 'mint'));
  count++;
  for (const proof of [{ password: 'test-proof' }, { credential: 'test-proof' }]) {
    const result = await authorize({ gid, ...proof });
    assert.equal(result.status, 200);
    assert.deepEqual(result.calls.map(([kind]) => kind), ['binding', '/api/auth/login', 'mint']);
    assert.equal(result.calls[1][1].password, 'test-proof');
    count++;
  }
}
const invalid = await authorize({ gid: 'invalid', password: 'test-proof' });
assert.equal(invalid.status, 400);
assert.equal(invalid.calls.length, 0);
count++;
console.log(`MA'AT credential boundary: PASS (${count} behavioral cases)`);
console.log('All identities require active server-side binding and matching password-authenticated user before session mint.');
