# ADR 003: Single database migration authority

- Status: Proposed
- Context: Existing Supabase SQL migrations are present; the target design sketches Prisma.
- Decision: Supabase SQL migrations remain authoritative during migration. Any Prisma schema is initially descriptive and must not independently mutate production schema.
- Consequences: A switch requires a reviewed migration plan, schema drift check, backup/restore rehearsal and rollback strategy.
