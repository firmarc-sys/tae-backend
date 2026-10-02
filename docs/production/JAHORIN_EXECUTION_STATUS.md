# Jahorin production execution status

## What this branch now wires

The authenticated Jahorin execution runtime calls `executeJahorinCapability` rather than routing every requested capability through the Mercury orchestration endpoint and returning its render/orchestration envelope.

The dispatcher has concrete adapter bindings for:

- `software.code`: Vertex AI code generation through the existing `CODE` model policy. This produces code text; it does not run tests, commit files, or deploy.
- `web.research`: Vertex AI text generation with Google Search grounding enabled through the existing Interweb policy.
- `documents.scribe`: Vertex AI document-content generation. It explicitly reports `persistence: "not_performed"`; it does not claim to save a file.
- `media.image`, `media.video`, and `media.audio`: existing Vertex AI image/video/audio generation adapters.
- `system.orchestrate` and common Jahorin/chat aliases: the existing Mercury orchestration path.

All other capabilities fail closed with `CAPABILITY_ADAPTER_UNAVAILABLE` (HTTP 503) until a real adapter exists. In particular, this dispatcher does **not** claim to execute arbitrary shell commands, run code, manipulate files, access a camera, control devices, send email, modify calendars, deploy cloud resources, or run data pipelines.

## Runtime contract

A task request is accepted by `POST /runtime/executions`, persisted, and dispatched asynchronously. The current runtime writes execution and event rows to Supabase and provides status, cancellation-request, and SSE event routes.

Important limitation: the current runtime worker is fire-and-track in the API process. Durable execution records are not equivalent to a durable external job queue; process-restart recovery and hard cancellation still require implementation and testing.

## Required environment

- Vertex AI: Cloud Run service identity with Vertex AI permissions, plus `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` / `VERTEX_LOCATION` as required by the existing router.
- Supabase: `SUPABASE_URL` and server-side `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`; never expose these in the browser.
- Existing ARI session and identity configuration must remain active.

Do not deploy by merely merging this branch. Run `npm run check`, verify the required tables and secrets in the intended service, deploy a new revision, and perform authenticated low-risk smoke tests.

## Acceptance tests added

`scripts/test-jahorin-capability-dispatch.mjs` verifies provider dispatch for code generation, grounded research, image generation, document persistence honesty, preservation of the core orchestrator route, and fail-closed behavior for unsupported external actions.

The tests use fake providers. They verify dispatch contracts, not live Vertex AI access or Cloud Run production behavior.
