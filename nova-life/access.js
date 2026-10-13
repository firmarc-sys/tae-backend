import { NOVA_LIFE_CANON } from './canon.js';

export function fail(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function allowlistFromEnv(env = process.env) {
  return new Set(
    String(env.NOVA_LIFE_BETA_GIDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function ownerGidFromEnv(env = process.env) {
  return String(env.SIOS_OWNER_GID || '399152573423');
}

export function sessionFromPrincipal(principal) {
  if (!principal || principal.kind === 'public' || !principal.gid) {
    return {
      authenticated: false,
      gid: null,
      tier: principal?.tier || null,
      kind: principal?.kind || 'public',
      experienceAccess: [],
      entitlements: [],
    };
  }
  const entitlements = Array.isArray(principal.entitlements) ? principal.entitlements.map(String) : [];
  const experienceAccess = [
    ...(Array.isArray(principal.experienceAccess) ? principal.experienceAccess : []),
    ...(Array.isArray(principal.experience_access) ? principal.experience_access : []),
  ].map(String);
  if (entitlements.includes('nova-life') || entitlements.includes('*')) experienceAccess.push('nova-life');
  return {
    authenticated: true,
    gid: String(principal.gid),
    tier: principal.tier || null,
    kind: principal.kind || 'session',
    experienceAccess: [...new Set(experienceAccess)],
    entitlements,
  };
}

export function authorizeNovaLife(session, { allowlist = allowlistFromEnv(), ownerGid = ownerGidFromEnv() } = {}) {
  if (!session?.authenticated || !session.gid) {
    return {
      allowed: false,
      reason: 'UNAUTHENTICATED',
      experience: 'orbit',
      gid: null,
    };
  }
  const granted = session.experienceAccess.includes('nova-life')
    || session.tier === 'owner'
    || session.kind === 'owner'
    || session.gid === ownerGid
    || allowlist.has(session.gid);
  if (!granted) {
    return {
      allowed: false,
      reason: 'NOVA_LIFE_ACCESS_DENIED',
      experience: 'jahorin',
      gid: session.gid,
    };
  }
  return {
    allowed: true,
    reason: 'AUTHORIZED_BETA_GID',
    experience: NOVA_LIFE_CANON.experience,
    gid: session.gid,
    program: NOVA_LIFE_CANON.program,
    cohort: NOVA_LIFE_CANON.cohort,
  };
}

export function assertNovaLifeAccess(session, options) {
  const decision = authorizeNovaLife(session, options);
  if (!decision.allowed) {
    throw fail(
      decision.reason === 'UNAUTHENTICATED' ? 401 : 403,
      decision.reason === 'UNAUTHENTICATED'
        ? 'Authenticated GID session required'
        : 'GID is not authorized for Nova Life Live Beta',
      decision.reason,
    );
  }
  return decision;
}

export function identityExperience(principal, options) {
  const decision = authorizeNovaLife(sessionFromPrincipal(principal), options);
  return {
    program: NOVA_LIFE_CANON.program,
    cohort: decision.allowed ? NOVA_LIFE_CANON.cohort : null,
    experience: decision.experience,
    authorized: decision.allowed,
    reason: decision.reason,
    phase: decision.experience === 'orbit' ? 'orbit' : decision.experience === 'jahorin' ? 'personal' : 'eligible',
    canon: NOVA_LIFE_CANON.phrase,
    modules: [...NOVA_LIFE_CANON.modules],
    augment: null,
    authentication: NOVA_LIFE_CANON.authentication,
    login_created: false,
  };
}

export function clientAccessClaimsIgnored(body = {}) {
  const claimed = body?.experienceAccess
    || body?.experience_access
    || body?.beta
    || body?.nova_life
    || body?.query?.beta;
  return {
    ignored: true,
    claimed: Boolean(claimed),
    authoritative: 'server-session-and-allowlist',
  };
}
