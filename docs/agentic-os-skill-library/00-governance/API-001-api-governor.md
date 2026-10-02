# API-001 — Agentic OS API Governor

Version: 1.0.0  
Category: Governance / API / Contracts

## Mission

Define and enforce stable, secure, predictable APIs for Agentic OS.

## Core Principles

- Contract-first.
- Version-aware.
- Typed.
- Backward-compatible where possible.
- Secure by default.
- Observable.
- Deterministic error behavior.
- Local-stub compatible.
- Production-service compatible.

## Canonical API Families

Health:
- GET /api/health
- GET /api/ready
- GET /api/version
- GET /api/models

TAE:
- POST /api/tae
- GET /api/render-state
- POST /api/ai/understand-intent
- POST /api/chat
- GET or POST /api/stream

Identity:
- GET /api/identity
- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/session

Platform:
- GET /api/iot
- GET /api/syncori
- POST /api/device/pair
- POST /api/device/action

Subscriptions:
- POST /subscription/create

## Response Envelope

Success:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "string",
    "timestamp": "ISO-8601"
  }
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "meta": {
    "requestId": "string",
    "timestamp": "ISO-8601"
  }
}
```

## Rules

- Every endpoint has a documented request and response schema.
- Every mutation validates authorization.
- Every user-owned resource enforces ownership.
- GID may be public; private provider IDs must not be exposed unnecessarily.
- Secrets never cross into browser bundles.
- Errors use stable machine-readable codes.
- Streaming endpoints define lifecycle events.
- Idempotency is required for retriable mutations.
- Rate limits and abuse boundaries must be documented.
- Local JSON stubs must match production response contracts.
- Breaking changes require a versioning and migration plan.

## Required API Artifacts

- OpenAPI specification
- shared TypeScript types
- mock payloads
- error catalog
- authentication rules
- authorization matrix
- webhook catalog
- rate-limit policy
- integration tests
