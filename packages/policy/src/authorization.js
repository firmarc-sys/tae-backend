/** Deny by default. Caller must construct subject from verified identity and membership. */
export function requireRole(subject, allowedRoles) {
  if (!subject || subject.authenticated !== true) return { allowed: false, reason: "unauthenticated" };
  if (typeof subject.actorId !== "string" || !subject.actorId || typeof subject.tenantId !== "string" || !subject.tenantId) return { allowed: false, reason: "missing_identity_context" };
  if (!Array.isArray(subject.roles) || !subject.roles.some((role) => allowedRoles.includes(role))) return { allowed: false, reason: "insufficient_role" };
  return { allowed: true, reason: "role_granted" };
}