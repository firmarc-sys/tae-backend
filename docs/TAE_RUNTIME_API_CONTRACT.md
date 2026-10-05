# Jahorin TAE Runtime API Contract

This document is the canonical API contract for the Jahorin Frontend GA server-side adapter and the TAE/ARI runtime.

## Authority and identity

- Frontend server routes call ARI using the server-only `ARI_BASE_URL` environment variable.
- Every private endpoint requires an authenticated ARI session cookie (`ari_session`) or an accepted bearer token.
- The runtime derives the caller's GID from the verified session. A client-supplied `gid` is never an identity or authorization source.
- All database reads and writes for executions, artifacts, and profile metadata are filtered by the authenticated GID.
- Requests should include `x-request-id`; ARI creates one when absent. Responses return it in both the header and JSON when possible.
- Do not expose runtime origins, provider keys, or service-role keys through `NEXT_PUBLIC_*` variables.

## Synchronous capability invocation

### `POST /api/runtime`

Request:

```json
{
  "capability": "ptah",
  "intent": "Explain or execute the requested capability",
  "payload": { "prompt": "User request" },
  "context": { "source_surface": "jahorin-frontend-ga" },
  "request_id": "client-generated-or-server-generated"
}
```

The authenticated runtime routes the capability through its configured execution/model path. Provider errors are returned as errors; clients must not replace failed execution with a simulated success.

## Durable executions

### `POST /api/runtime/executions`

Accepts `capability`, non-empty `intent`, optional `payload` and `context`, optional `request_id`, and optional `idempotency_key`. Returns HTTP 202 with the durable execution record in `execution`. Use an idempotency key when retrying the same intended operation.

### `GET /api/runtime/executions?limit=25&state=running`

Returns recent executions for the authenticated GID. `limit` is clamped to 1–100. Supported states: `accepted`, `running`, `completed`, `failed`, `cancel_requested`, and `cancelled`.

### `GET /api/runtime/executions/:id`

Returns one execution only when it belongs to the authenticated GID.

### `GET /api/runtime/executions/:id/events`

Returns a server-sent event stream for that execution. The execution is authorization-checked before streaming.

### `POST /api/runtime/executions/:id/cancel`

Requests cancellation of an execution owned by the authenticated GID.

## Persistent artifacts

### `GET /api/runtime/artifacts?limit=25`

Returns artifacts belonging to the authenticated GID, newest update first.

### `POST /api/runtime/artifacts`

Request:

```json
{
  "kind": "document",
  "title": "Artifact title",
  "content": "Artifact content",
  "metadata": {}
}
```

Creates an artifact in the existing `public.artifacts` table. Allowed kinds: `document`, `note`, `transcript`, `image`, `audio`, `video`, `code`, and `other`. Title is limited to 240 characters and content to 200,000 characters.

## Persistent profile

### `GET /api/runtime/profile`

Returns the authenticated account's profile metadata. The client must not provide a GID query parameter.

### `PUT /api/runtime/profile`

Request: `{ "profile": { ... } }`. Saves profile metadata under the authenticated account, preserving unrelated account metadata.

### `DELETE /api/runtime/profile`

Removes the profile metadata for the authenticated account without deleting the account itself.

## Frontend configuration

Required server-side setting:

```dotenv
ARI_BASE_URL=https://<canonical-ari-cloud-run-origin>
```

Backend deployment must also configure its existing Supabase and ARI session secrets. Keep secret values in the deployment secret manager, not in source control.

## Error semantics

- `400` invalid request or unsupported filter.
- `401` missing or invalid authentication.
- `404` resource not found within the caller's scope.
- `413` request exceeds the documented size limit.
- `422` required semantic fields are missing.
- `502` frontend cannot reach ARI.
- `504` runtime request timed out.
- `503` runtime configuration or dependency is unavailable.

A successful HTTP response indicates that the operation was accepted or completed according to that endpoint's contract; for asynchronous executions, poll the execution record or consume its event stream for the terminal result.
