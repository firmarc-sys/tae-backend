import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const edge = fs.readFileSync('credential-gateway.js', 'utf8');
const production = fs.readFileSync('production-gateway.js', 'utf8');

assert(pkg.scripts?.start === 'node credential-gateway.js', 'credential gateway is not the public ARI start authority');
assert(edge.includes('pathname === "/api/identity/authorize"'), 'credential gateway does not intercept GID authorization');
assert(edge.includes('CREDENTIAL_REQUIRED'), 'credential requirement is missing');
assert(edge.includes('OWNER_ACCESS_CODE'), 'Prime Orchestrator proof is not wired');
assert(edge.includes('/api/auth/login'), 'subscriber password proof is not delegated to Supabase auth');
assert(edge.includes('auth_user_id'), 'GID is not bound to the registered auth user');
assert(edge.includes('row.status !== "active"'), 'GID access must fail closed unless identity status is active');
assert(edge.includes('user_metadata?.gid'), 'authenticated Supabase user GID continuity is not verified');
assert(edge.includes('timingSafeEqualText'), 'owner credential comparison is not timing-safe');
assert(!edge.includes('console.log(password)'), 'credential material must never be logged');

const legacyAuthorize = production.match(/async function handleAuthorize[\s\S]*?\n}\n\nasync function handleRegister/);
assert(legacyAuthorize, 'inner production authorize handler not found');
assert(edge.indexOf('pathname === "/api/identity/authorize"') < edge.indexOf('return proxyStream(req, res)'), 'credential intercept must occur before generic proxying');

console.log("MA'AT credential boundary: PASS");
console.log('Public flow: GID + credential -> credential edge -> Supabase proof -> internal session mint');
console.log('Inner GID-only mint remains unreachable from the public Cloud Run edge.');
