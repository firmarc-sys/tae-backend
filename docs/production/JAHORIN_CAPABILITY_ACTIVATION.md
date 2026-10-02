# Jahorin capability activation checklist

This branch now includes a persistent capability API for tenant-scoped artifacts, explicit memory, and tasks, in addition to the provider-generation dispatcher. It also includes a SQL migration for the corresponding Supabase tables and an audit-event table.

## Apply database changes

Apply these migrations in order to the configured Supabase project:
1. `supabase/migrations/0001_jahorin_runtime.sql`
2. `supabase/migrations/0002_jahorin_execution_events.sql`
3. `supabase/migrations/0003_jahorin_persistent_capabilities.sql`

Do not run migrations against a production project without a reviewed backup/change window. The service-role key stays only in Cloud Run Secret Manager.

## API endpoints

- `GET /api/jahorin/capabilities`
- `GET|POST /api/jahorin/artifacts`
- `GET|PATCH|DELETE /api/jahorin/artifacts/:id`
- `GET /api/jahorin/memory`
- `PUT|DELETE /api/jahorin/memory/:key`
- `GET|POST /api/jahorin/tasks`
- `PATCH|DELETE /api/jahorin/tasks/:id`

All endpoints require the existing ARI authenticated principal. Tenant IDs are derived from the authenticated server-side principal, not accepted from request JSON. Writes are audit logged. The current artifact adapter stores text/JSON content in Postgres; binary object storage and signed download URLs remain separate work.

## Remaining integrations that require infrastructure or explicit approval

The repository cannot safely enable a shell sandbox, browser automation, OAuth providers, email/calendar sends, camera/microphone capture, cloud deployment, or financial mutations without real service credentials, per-tenant consent, isolated execution infrastructure, and external acceptance tests. They remain unavailable by design until those adapters exist. The current execution dispatcher still runs in-process after durable acceptance; a separately deployed worker/queue and restart recovery are still required for production-grade long-running work.

## Release gates

- Apply migrations to a non-production Supabase project first.
- Run `npm run check`.
- Test cross-tenant isolation, auth expiry, duplicate/idempotent requests, concurrent writes, and audit persistence.
- Verify actual Vertex AI generation and Cloud Run health on a non-production revision.
- Do not merge/deploy based on fake-provider contract tests alone.
