export interface AuthorizationSubject {
  actorId: string; tenantId: string; roles: readonly string[]; authenticated: boolean;
}
export interface AuthorizationDecision { allowed: boolean; reason: string; }
/** Minimal deny-by-default primitive. Roles must come from verified server-side membership. */
export function requireRole(subject: AuthorizationSubject, allowedRoles: readonly string[]): AuthorizationDecision {
  if (!subject.authenticated) return { allowed: false, reason: "unauthenticated" };
  if (!subject.actorId || !subject.tenantId) return { allowed: false, reason: "missing_identity_context" };
  if (!subject.roles.some((role) => allowedRoles.includes(role))) return { allowed: false, reason: "insufficient_role" };
  return { allowed: true, reason: "role_granted" };
}