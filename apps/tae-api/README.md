# TAE API scaffold

A separate Node/Express service entry point exists at `server.js`; it is not wired into the root ARI Dockerfile or Cloud Run deployment. `/healthz` only confirms process liveness. `/readyz` remains 503 until real identity, tenant, audit and durable-workflow adapters exist. All `/api/*` routes return a structured 503 rather than pretending unfinished features work.

Run locally from the repository root with `node apps/tae-api/server.js` (requires root dependencies installed). Default port is 8081; override with `TAE_API_PORT`.

Before any staging exposure, implement verified Supabase identity and tenant membership, tenant-scoped repositories/RLS, authorization, rate limiting, audit persistence, schema validation, durable workflow dispatch, and integration tests. Do not point the live frontend or production hostname at this scaffold.