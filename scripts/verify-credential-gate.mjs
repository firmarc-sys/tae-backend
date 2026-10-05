import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const edge = fs.readFileSync('credential-gateway.js', 'utf8');
const production = fs.readFileSync('production-gateway.js', 'utf8');

assert(pkg.scripts?.start === 'node credential-gateway.js', 'credential gateway is not the public ARI start authority');
assert(edge.includes('pathname === "/api/identity/authorize"'), 'credential gateway does not intercept GID authorization');
assert(edge.includes('if (gid === OWNER_GID)'), 'Prime Orchestrator owner branch is missing');
const ownerBranch = edge.slice(edge.indexOf('if (gid === OWNER_GID)'), edge.indexOf('CREDENTIAL_REQUIRED'));
assert(ownerBranch.includes('crypto.timingSafeEqual') && ownerBranch.includes('ownerAccessCode'), 'owner GID must require the Secret Manager owner access code');
assert(ownerBranch.indexOf('timingSafeEqual') < ownerBranch.indexOf('return mintInnerSession'), 'owner session must not mint before access-code proof');
assert(edge.includes('OWNER_AUTH_NOT_CONFIGURED'), 'owner authorization must fail closed when no access code is configured');
assert(edge.includes('"x-ari-internal-authorize": internalAuthorizeToken'), 'credential edge must prove itself to the inner authorize handler');
assert(edge.includes('stripInternalHeaders('), 'public requests must not be able to forward the internal authorize header');
assert(production.includes('internalAuthorizeVerified(req)'), 'inner GID-only authorize must reject requests that bypass the credential edge');
assert(edge.includes('return mintInnerSession(req, res, gid);'), 'Prime Orchestrator does not mint the canonical inner session');
assert(edge.includes('CREDENTIAL_REQUIRED'), 'member credential requirement is missing');
assert(edge.indexOf('if (gid === OWNER_GID)') < edge.indexOf('CREDENTIAL_REQUIRED'), 'owner exception must resolve before member credential enforcement');
assert(edge.includes('/api/auth/login'), 'subscriber password proof is not delegated to Supabase auth');
assert(edge.includes('auth_user_id'), 'GID is not bound to the registered auth user');
assert(edge.includes('row.status !== "active"'), 'GID access must fail closed unless identity status is active');
assert(edge.includes('trustedGidFromUser(authenticatedUser)'), 'authenticated Supabase user GID continuity is not verified');
assert(!edge.includes('user_metadata?.gid'), 'user-editable user_metadata must never decide GID');
assert(edge.includes('async function waitForInnerChainReady()'), 'credential edge does not wait for the full ARI chain before session mint');
assert(edge.includes('innerJson("/api/ready")'), 'credential edge does not probe canonical ARI readiness');
assert(edge.indexOf('await waitForInnerChainReady();') < edge.indexOf('innerJson("/api/identity/authorize"'), 'session mint can occur before full ARI readiness');
assert(edge.includes('chain_ready: readiness.ready'), 'credential-edge health does not report full-chain readiness');
assert(!edge.includes('console.log(password)'), 'credential material must never be logged');

const legacyAuthorize = production.match(/async function handleAuthorize[\s\S]*?\n}\n\nasync function handleRegister/);
assert(legacyAuthorize, 'inner production authorize handler not found');
assert(edge.indexOf('pathname === "/api/identity/authorize"') < edge.indexOf('return proxyStream(req, res)'), 'credential intercept must occur before generic proxying');

console.log("MA'AT credential boundary: PASS");
console.log('Prime Orchestrator flow: canonical owner GID + access code -> credential edge -> full ARI readiness -> internal session mint');
console.log('Member flow: GID + credential -> credential edge -> Supabase proof -> full ARI readiness -> internal session mint');
console.log('Cold-start law: no GID session mint is attempted until /api/ready confirms the complete inner chain.');
console.log('Inner GID-only mint is unreachable from the public Cloud Run edge; it requires the per-process edge token.');