# ADR 009: Tenant isolation

- Status: Proposed
- Decision: Resolve tenant identity from verified server-side authentication and membership data, never from an untrusted body/header alone. Every tenant-owned read/write must be tenant-scoped in the database query or transaction. Background jobs carry tenant context and re-check authorization at execution time.
- Verification: Negative cross-tenant tests cover routes, repositories, object storage, queue messages, memory retrieval, audit queries and capability dispatch.
