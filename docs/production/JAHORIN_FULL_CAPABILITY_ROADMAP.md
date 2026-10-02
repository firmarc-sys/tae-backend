# Jahorin full-capability implementation plan

The canonical executable contract is `jahorin-capability-catalog.js`. It enumerates capability IDs, operations, deity ownership, required adapters, and side-effect classes. This prevents the 104-deity registry from being mistaken for 104 implemented agents.

## Current implementation boundary

The existing Vertex-backed dispatcher supports text/research, code generation, document-content generation, and image/video/audio generation at the provider-dispatch layer. That does not mean storage, code execution, persistence, or live Cloud Run verification has passed.

Capabilities marked `adapter_required` must remain fail-closed until their real adapters are implemented, configured, tenant-scoped, and tested. Do not label code generation as code execution, generated document content as a saved file, grounded generation as a full browser session, or a model plan as an external side effect.

## Production requirements for every adapter

- Versioned input/output schema and explicit operation allowlist.
- Authenticated principal and tenant scope derived server-side, never trusted from request JSON.
- Ma'at policy authorization, entitlement/quota checks, request/correlation IDs, and immutable audit events.
- Deadline, cancellation, idempotency, bounded retries, size limits, and safe error normalization.
- Durable execution/event/result persistence; workers recover after process restart.
- Secret isolation, least-privilege credentials, SSRF/path-traversal protections, and redacted logs.
- Contract tests with fakes plus integration tests against the actual configured service; fake tests are not evidence of live readiness.

## Adapter delivery order

1. Shared runtime: durable queue/worker, cancellation/recovery, tenant authorization and audit.
2. Files and documents: private object storage, metadata/versioning, OCR/ingestion, export and deletion.
3. Code/terminal: ephemeral isolated sandbox with CPU/memory/time/network quotas and no production secrets.
4. Interweb: grounded research plus isolated browser automation with SSRF/download controls.
5. Media: image edit/analyze, audio transcription, realtime audio/video and user-granted device permissions.
6. Connectors: OAuth registry, email/calendar, signed webhooks, revocation and per-action confirmation.
7. Data/cloud: tenant data pipelines, read-only query modes, plan-before-apply deployment, approval gates and rollback.
8. Platform: persistent memory, knowledge retrieval, tasks/scheduling, billing/credits and observability.

High-impact operations (sending messages, deleting data, spending credits, controlling devices, and deploying cloud resources) require explicit authorization and confirmation policies. Registering an adapter must not auto-enable these operations.
