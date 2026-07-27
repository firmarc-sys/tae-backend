# Agentic Mercury TimeRunner — Gap Analysis

Audit date: 2026-07-27  
Input package: `tae-backend-main (1)(2).zip`  
Canonical target: Mercury Infinite Canvas Desktop

## Preserved conforming implementation

- FastAPI application and versioned API namespace
- TAE orchestration and fallback command processor
- GID identity model and owner GID
- PostgreSQL/Alembic persistence layer
- JWT authentication and role model
- billing and usage service boundaries
- WebSocket runtime state channel
- render-state, IoT, Syncori, identity, health, and TAE endpoints
- React 19, Vite, TypeScript, Three.js/R3F toolchain
- opening media, page references, identity media, and legacy production assets
- PWA manifest and service worker
- Docker, Compose, Render, and CI configuration

## Conflicts found in the original frontend

| Original behavior | Canonical conflict | Resolution |
|---|---|---|
| Portrait-only wrapper | Must adapt across 9:16, 16:9, and 48:9 | Replaced with adaptive persistent compositor |
| One page image at a time | 48:9 must show three complete portrait workspaces | Added three-surface workspace rail |
| Grid of navigation cards | Workspaces are spatial routes, not dashboard cards | Replaced with Liquid Dock and launcher |
| Top status layer | Device status belongs in bottom Status Blob | Removed from active runtime |
| Blurred black panels | No glass/blur panels | New runtime uses opaque chrome gradients |
| “Next page” navigation | Horizontal spatial navigation | Added route-aware slots and portrait swipe |
| Fixed central orb terminology | Latest canon uses Living Intelligent Crystal | Replaced in active runtime and orchestration copy |
| Dock-like buttons remounted per page | Liquid Dock must be persistent and physically anchored | Added one fixed dock outside workspace surfaces |
| Runtime identity entered through onboarding only | Demo must open immediately and remain testable | Owner demo runtime is immediately available |
| AI-dependent demo copy | Exact activation response must be deterministic | Added backend deterministic activation path |
| Missing `/api/stream` | Contract requires SSE stream | Added canonical stream alias |

## Implemented in this build

- package renamed to `Agentic Mercury TimeRunner`
- persistent Mercury Desktop runtime
- responsive three-workspace landscape compositor
- portrait swipe and page indicators
- 48:9 ultra-wide layout rules
- Interweb, Home, Infinite Canvas, TAE, Chat, Plan, Build, Scribe, Loop, Files, Media, and Settings registry
- fixed Liquid Dock with persistent primary routes
- Status Blob with real time/date, connection state, and Battery API when available
- speech-recognition dock control when supported
- draggable and locally persisted desktop icons
- hash route persistence
- Living Intelligent Crystal fallback material
- boot choreography and exact Demo Mode declaration
- deterministic TAE Demo Mode backend response
- API offline/auth fallback from v1 to legacy runtime route
- SSE stream alias
- PWA name/orientation/cache identity updates
- source-of-truth, build, registry, schema, validation, and handoff reports

## Intentionally preserved legacy material

Legacy HTML pages, earlier image assets, old components, and the nested `anything.zip` are retained for provenance. They are not imported by the active Mercury runtime. Removal should occur only after the Master Architect confirms the replacement asset set and archival policy.
