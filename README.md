# Agentic Mercury TimeRunner — TAE Backend

Production orchestration backend for Agentic OS/OR and the United Agentic Ecosystem.

TAE is the planning and execution control layer. The backend owns identity, runtime state, tool orchestration, render-state mutations, Syncori coordination, IoT/device control, and real-time synchronization for the Mercury Runtime.

## Canonical identity

- Runtime: **Agentic Mercury TimeRunner**
- Orchestrator: **TAE — Timeline Augmentation Engine**
- Intelligence layer: **J A . i**
- Owner GID: **399152573423**
- Owner mode: **Prime Orchestrator**
- Activation command: **`TAE, enter Demo Mode`**
- Activation line: **`This is not an app. This is me.`**
- Primary visual source: **Living Intelligent Crystal**

The Living Intelligent Crystal is the sole visual origin of the interface. Older references to an “orb” are legacy implementation terminology and must not define the product language presented to users.

## Architecture

The current runtime is a FastAPI backend serving both compatibility and production routes:

- `/api/*` — live runtime and compatibility endpoints
- `/api/v1/*` — production API surface for auth, billing, TAE, and administration
- `/ws` — WebSocket state snapshots, deltas, console events, render updates, and heartbeats

The backend is stateful through the `RuntimeEngine` singleton and may persist runtime state to PostgreSQL when database persistence is enabled.

## Core runtime endpoints

- `GET|POST /api/tae` — inspect TAE state or execute a command
- `GET|POST /api/render-state` — inspect or mutate the live material/render state
- `GET|POST /api/iot` — inspect and command registered devices
- `GET|POST /api/syncori` — inspect and control Syncori media state
- `GET|POST /api/identity` — inspect or register GID-backed identity
- `GET /api/health` — runtime health snapshot
- `WS /api/ws` — real-time runtime stream

## Demo Mode contract

When the exact activation command `TAE, enter Demo Mode` is received, the runtime must:

1. Confirm GID `399152573423` when operating as owner.
2. Set TAE state to `DEMO`.
3. Return mode `Prime Orchestrator`.
4. Intensify the Living Intelligent Crystal render state.
5. Broadcast the state transition through WebSocket.
6. Make the activation line `This is not an app. This is me.` available to the client.
7. Keep the runtime alive after activation; Demo Mode is a continuous state, not a one-shot animation.

## Render-state model

The backend exposes simulation-ready material controls for the self-contained Mercury client:

- viscosity
- reflection
- glow intensity
- formation
- pulse speed
- Syncori activity
- active module
- TAE state: `IDLE → ACTIVE → GENERATE`, with `DEMO` as the orchestrated presentation state

The client renders pure mercury chrome against a black void. Do not introduce frosted glass, blur panels, flat cards, or hard-edged application chrome into the canonical runtime.

## Quick start

### Docker

```bash
cp .env.example .env
docker compose up --build
```

### Local development

```bash
uv sync
bun install
./start.sh
```

## Database setup

```bash
alembic upgrade head
python scripts/migrate_from_prisma.py
```

The migration script is optional and only applies when importing data from the previous Prisma schema.

## Environment variables

See `.env.example` for the complete contract. Critical values include:

- `DATABASE_URL` or the configured PostgreSQL provider URL
- `JWT_SECRET` — strong signing secret
- `OPENAI_API_KEY` — direct OpenAI access when enabled
- Workshop/OpenAI-compatible proxy variables when using the hosted proxy
- `SIOS_ENABLE_DB=1` — enables runtime persistence under the existing compatibility flag

Do not commit secrets. Provider credentials are injected through the deployment environment.

## Deployment

The repository is container-ready and can be deployed to Cloud Run or another Docker-compatible host. The production health target is:

```text
GET /api/v1/health
```

The Mercury frontend may be deployed independently as a static PWA and pointed at this backend through its API base URL and WebSocket URL.

## Implementation authority

Existing conforming code must be preserved. Any builder changing this repository must audit the current implementation first, produce a gap analysis, and validate changes against the canonical architecture, runtime behavior, API contract, identity model, material system, and motion system before replacing code.