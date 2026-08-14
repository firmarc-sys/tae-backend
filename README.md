# Agentic Mercury Time Runner — ARI Gateway

This repository is the currently deployed Cloud Run implementation behind the canonical ARI hostname for Agentic Mercury Time Runner.

## Production role

Public product: **Agentic Mercury Time Runner**

Architecture:

- Mercury — persistent runtime / living shell
- Jahorin — user-facing intelligence
- GID — identity authority
- TAE — Timeline Augmentation and orchestration
- ARI — browser-facing REST gateway implemented by `server.js`
- SYNCORI — Audio and Optics instrument suite

Production ARI hostname:

`https://ari-689058655022.us-west1.run.app`

The canonical frontend is maintained separately in `firmarc-sys/Mercury-TimeRunner` and reaches this service through same-origin `/api/*` proxying on Netlify.

## Deployed runtime

The production container is Node 20 + Express and starts with:

```bash
npm start
```

`Dockerfile`, `package.json`, and `server.js` are the deployment authority for the live ARI Cloud Run service.

The historical Python/FastAPI source remains in this repository as legacy/reference code. It is not required to build or run the current production ARI container. Its maintenance tests are isolated in `.github/workflows/legacy-python-ci.yml` and trigger only when legacy Python paths change.

## Canonical ARI routes

The gateway mounts its compatibility router at both `/api/*` and direct paths. Browser production uses `/api/*`.

- `GET /api/health`
- `GET /api/ready`
- `GET|POST /api/identity`
- `POST|DELETE /api/identity/session`
- `GET|POST /api/render-state`
- `GET|POST /api/iot`
- `GET|POST /api/syncori`
- `GET|POST /api/tae`
- `POST /api/runtime`
- `POST /api/generate`

Provider-backed generation is performed server-side. No Google credentials belong in browser-delivered code.

## Google provider

Preferred production mode is Vertex AI using the Cloud Run service identity and `@google/genai`.

Required configuration:

- `GOOGLE_CLOUD_PROJECT=689058655022`
- `VERTEX_LOCATION=global`
- `GEMINI_MODEL=gemini-2.5-flash`

The Cloud Run service identity must have permission to invoke Vertex AI publisher models, including `aiplatform.endpoints.predict`.

A Gemini Developer API key can be configured as a server-side fallback, but is not required when Vertex AI service identity access is configured correctly.

## GID session security

Provider-backed capabilities must be protected by real ARI sessions in production.

Required Cloud Run configuration:

- `ARI_REQUIRE_AUTH=true`
- `ARI_SESSION_SECRET` — strong signing secret
- `OWNER_ACCESS_CODE` — owner authentication secret
- `SIOS_OWNER_GID=399152573423`

Store signing/access secrets in Google Secret Manager and reference them from Cloud Run. Do not commit them.

Session behavior:

- invalid access code → 401
- valid access code → signed HttpOnly + Secure + SameSite=Strict session cookie
- unauthenticated identity → `authenticated:false`
- authenticated identity → verified GID state
- DELETE session → clears the cookie

## Production validation

`.github/workflows/ci.yml` is the production gateway release gate. It validates:

- Node syntax
- health/readiness surface
- GID session creation/rejection
- unauthenticated provider access rejection when auth is enabled
- TAE demo contract
- production Docker image build

`.github/workflows/ari-live-deploy-watch.yml` validates the actual Cloud Run hostname after repository changes. It verifies the canonical ARI route surface, real provider generation, GID security configuration, and the TAE demo seam.

## External infrastructure requirements

A source commit can be correct while production remains unready if Google Cloud configuration is missing. `/api/ready` and the live deployment watch must remain truthful about these states.

Do not mark Agentic Mercury Time Runner production-ready until:

1. the Cloud Run service identity can successfully invoke the configured Vertex model;
2. GID session secrets are configured;
3. invalid GID access is rejected;
4. the browser-facing Netlify `/api/*` proxy passes the same live checks.
