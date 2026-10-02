/** Enforces tenant ownership at a data boundary; queries must also be tenant-scoped. */
export function assertTenantMatch(expectedTenantId, record) {
  if (typeof expectedTenantId !== "string" || !expectedTenantId || !record || record.tenantId !== expectedTenantId) {
    const error = new Error("TENANT_ISOLATION_VIOLATION");
    error.code = "TENANT_ISOLATION_VIOLATION";
    throw error;
  }
  return record;
}