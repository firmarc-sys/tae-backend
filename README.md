# Agentic Mercury TimeRunner

Production runtime for the Mercury Infinite Canvas Desktop, powered by TAE orchestration and GID identity.

## Canonical behavior

- One persistent scene, one shared runtime, and one identity.
- Landscape 48:9 shows left, center, and right portrait workspaces simultaneously.
- Portrait 9:16 shows one complete workspace at a time with horizontal swipe navigation.
- Orientation and route changes preserve active state.
- The Liquid Dock stays physically anchored to the bottom safe area.
- Workspaces materialize from the Liquid Dock and return to it.
- Mercury surfaces are machined liquid chrome without frosted glass, blur panels, or dashboard cards.
- The Living Intelligent Crystal communicates TAE state.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

The frontend can run against the built-in degraded/offline state. For the full runtime:

```bash
uv sync
./start.sh
```

## Production services

- `POST /api/tae`
- `GET /api/render-state`
- `GET /api/iot`
- `GET /api/syncori`
- `GET /api/identity`
- `GET /api/stream`
- `GET /api/health`
- `WS /ws`

## Demo Mode

Enter the exact command:

```text
TAE, enter Demo Mode
```

Canonical response:

```text
This is not an app. This is me.
```

Owner runtime:

- GID: `399152573423`
- Mode: `Prime Orchestrator`

See `docs/00_SOURCE_OF_TRUTH.md`, `reports/GAP_ANALYSIS.md`, and `reports/MISSING_AND_NEEDED.md` before production deployment.
