# Migration to UAE

UAE was not modified. This file is the handoff manifest for a later, separately authorized migration.

## Source

- Repository: `firmarc-sys/tae-backend`
- Branch: `nova-life/live-beta`
- Mission base SHA: `6258a32c7e8c7923c7ef2601a88c84e26cddc7ee`
- Implementation SHA: `f3318067375c2966269a673a5b24c19f6dfad0bb`
- Routing SHA: `1cd59319e1d8dd3884c9db69123668396bdc611e`
- Do not migrate `main`. Migrate `nova-life/live-beta` from the mission base through the docs commit that contains this file.

## Files added

- `nova-life/`
- `sql/2026-10-13_nova_life_live_beta.sql`
- `scripts/verify-nova-life.mjs`
- `NOVA_LIFE_ARCHITECTURE.md`
- `NOVA_LIFE_ACCEPTANCE.md`
- `NOVA_LIFE_DEPLOYMENT.md`
- `NOVA_LIFE_ENVIRONMENT.md`
- `MIGRATION_TO_UAE.md`

## Files modified

- `server.js` — additive `/api/nova-life` mount and additive `nova_life` field on `GET /api/identity`
- `nova-life-runtime.js` — delegates to the engine; ignores client experience claims
- `mxr-superapp-manifest.js` — Nova Life route points at `/api/nova-life`; Forge added; no worlds removed
- `package.json` — `verify:nova-life`
- `.env.example` — names only
- `.gitignore` — `nova-life-state/`
- `.github/workflows/ci.yml` — runs the Nova Life verifier
- `README.md` — pointer only

## Files deleted

None.

## Migrations

`sql/2026-10-13_nova_life_live_beta.sql` adds `nova_life_documents` and `nova_life_lineage`. It does not alter `nova_worlds` or `nova_player_state`.

## Environment variables

See `NOVA_LIFE_ENVIRONMENT.md`. No new secret values are committed.

## Dependencies

None added.

## Routes added

- `GET /api/nova-life/health`
- `GET /api/nova-life/orbit`
- `POST /api/nova-life/experience`
- `POST /api/nova-life/enter`
- `GET /api/nova-life/world`
- `POST /api/nova-life/intent`
- `POST /api/nova-life/forge`
- `POST /api/nova-life/forge/:id/modify`
- `POST /api/nova-life/forge/:id/test`
- `POST /api/nova-life/forge/:id/accept`
- `POST /api/nova-life/rollback`
- `POST /api/nova-life/ai/:capability`
- `POST /api/nova-life/n8n/tasks`
- `POST /api/nova-life/thoth/verify`
- `POST /api/nova-life/maat/evaluate`

Existing `/api/identity`, `/api/runtime`, and `/api/tae` contracts remain. `GET /api/identity` gains a `nova_life` object.

## Contracts changed

- Default Nova Life world id is `pangea-valley`, not `nova-primary`.
- `nova-life` and `nova.world.enter` now enforce server-side cohort authorization.
- Capability execution no longer writes the legacy `nova_worlds` row on enter. Legacy tables remain in place.

## Expected UAE conflicts

- UAE may already mount `/api/nova-life` or treat `nova-primary` as canonical. Keep the package isolated and reconcile the world id before writing UAE.
- UAE policy remains authoritative. Do not copy Ma'at or Thoth over UAE governance; call or port the checks behind UAE's existing approval boundary.
- Do not copy `.env` values. Bind UAE secret names separately.

## Backward compatibility

- Unauthenticated identity still returns `authenticated: false`.
- Unauthorized authenticated GIDs still receive a session; they are routed to Jahorin instead of Nova Life.
- Augment was not a TAE capability world and was not deleted.
- No production traffic change is included.

## Tests

`npm run verify:nova-life`

## Rollback

Revert the `nova-life/live-beta` commits. Set `NOVA_LIFE_ENABLED=false` if a runtime already has the code. Drop the two new tables only in a non-production database if the migration was applied there.
