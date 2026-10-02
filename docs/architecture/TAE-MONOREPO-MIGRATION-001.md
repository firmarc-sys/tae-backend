# TAE backend monorepo migration

Status: architecture scaffold with executable policy tests; not a claim of production readiness.

## Safety constraints
- Preserve the root Node/Express ARI service, Dockerfile, package-lock.json, Cloud Run entry point and public routes.
- Do not deploy this branch automatically to the live ARI service. Keep main unchanged pending review and staging verification.
- Existing Supabase SQL migrations remain authoritative until a reviewed ADR changes that decision. Do not run Prisma migrations in parallel.
- Never commit credentials, live environment files, service account keys, tokens or production data.
- The new TAE API is isolated under apps/tae-api and is not the root deployment entry point.

## Target boundaries
- apps/tae-api: separately deployable, versioned TAE control-plane API.
- workers/: asynchronous, independently permissioned execution services.
- packages/contracts: stable API and event contracts.
- packages/policy and packages/security: shared primitives; each trust boundary must still enforce policy.
- infra/: reviewed infrastructure definitions.
- tests/: cross-service contracts, tenant isolation, recovery and end-to-end verification.

## Migration sequence
1. Inventory routes, auth/session behavior, provider routing, Supabase tables/RLS, Cloud Run settings and CI.
2. Define contracts and ADRs; keep compatibility adapters around existing behavior.
3. Implement identity, tenant repository, audit sink, durable queue and real API routes.
4. Implement worker idempotency, lease recovery, cancellation and dead-letter handling.
5. Add authorization, tenant-isolation, provider-boundary, deletion and recovery tests.
6. Deploy separately to staging and run smoke tests.
7. Promote only after explicit review and rollback rehearsal.

A folder or placeholder is not a capability. Mark capabilities implemented only when code, configuration, automated tests and deployed evidence exist.