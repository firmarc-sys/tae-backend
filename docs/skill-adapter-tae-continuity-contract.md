# TAE skill adapter and continuity contract v1

## Server-side invocation
- `POST /api/skills/{skill_id}/invoke` is server-side only and requires a valid signed `ari_session` and `x-jahorin-session-id`.
- The registry is loaded from `JAHORIN_SKILL_REGISTRY_PATH`. A skill is invokable only when status is `verified`, its adapter ID resolves to an installed function, its input schema validates, and all declared permissions are present.
- Tenant GID and session ID come from verified server-side identity, never from request-body claims.
- `durable: true` is returned only after persistence write and read-back verification succeed. Missing or failing persistence returns an error and never reports durable continuity.

## Continuity record
Required fields: `schema_version`, `gid`, `session_id`, `task_id`, `skill_id`, `adapter_id`, `idempotency_key`, `revision`, `status`, `created_at`, and `evidence`. Evidence records adapter ID, result SHA-256, and timestamp. The result is scoped to the same GID/session.

## Persistence adapter interface
Server-side implementation must provide `getByIdempotencyKey({gid,session_id,idempotency_key})`, `write(record)`, `read({gid,session_id,task_id})`, and `readSession({gid,session_id})`. All queries must enforce tenant/session predicates; idempotency keys must be unique per tenant/session. Staging verification must restart the runtime and recover the record from durable storage, not a process map or local snapshot.

## Current integration boundary
The routes are mounted in the manifest gateway. The gateway intentionally supplies no adapter map or persistence implementation yet, so invocation fails closed with `ADAPTER_NOT_INSTALLED` or `PERSISTENCE_UNAVAILABLE`. This is not a production-ready durable adapter. Registry entries remain unverified until staging integration and recovery tests pass.

## Security
Never accept tenant GID, permissions, or authentication identity from JSON input. Do not log credentials or raw sensitive payloads. High-impact tools must remain behind the existing approval system.