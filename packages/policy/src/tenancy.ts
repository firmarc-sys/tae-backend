export interface TenantScopedRecord { tenantId: string; }
/** Throws if a record returned from a data boundary violates the expected tenant. */
export function assertTenantMatch<T extends TenantScopedRecord>(expectedTenantId: string, record: T): T {
  if (!expectedTenantId || record.tenantId !== expectedTenantId) throw new Error("TENANT_ISOLATION_VIOLATION");
  return record;
}
