# Missing and Needed for Exact Production Fidelity

The package is buildable as a functional Mercury desktop shell. The following inputs are still required to reproduce the intended desktop **exactly**, rather than approximately.

## P0 — Canonical visual and motion sources

1. Final approved `Mercury in the infinite canvas` PNG at original resolution.
2. Final approved portrait 9:16 desktop PNG.
3. Final approved standard landscape 16:9 desktop PNG.
4. Final approved 48:9 three-workspace desktop PNG.
5. Canonical `Desktop loading.mp4` boot sequence.
6. Canonical Liquid Dock formation/navigation MP4.
7. Extracted lossless keyframes plus frame manifests for both videos.
8. Final desktop icon/glyph sheet with names and state variants.
9. Exact typefaces with distribution licenses or approved system-font substitutions.
10. Measured component geometry: dock width/height, surface bounds, chrome-band thickness, radii, safe-area offsets, and all portrait/landscape coordinates.

The older `opening.mp4`, page PNGs, orb media, and legacy HTML compositions are present, but they do not establish the latest exact Mercury Infinite Canvas geometry.

## P0 — Material and motion specifications

1. Approved mercury shader source or numeric material values:
   - IOR
   - metalness
   - roughness
   - viscosity
   - dispersion
   - reflection intensity
   - environment rotation
2. Approved HDRI/reflection environment.
3. Final Living Intelligent Crystal geometry or GLB.
4. State-by-state motion curves and durations for idle, active, generate, demo, materialize, dismiss, rotate, pan, and dock formation.
5. Reduced-motion canonical behavior.
6. Approved ambient, activation, navigation, and dock audio masters with usage rights.

## P0 — Production identity and security

1. Production PostgreSQL connection string.
2. Strong production JWT secret.
3. Production auth provider configuration.
4. Final GID issuance rules and collision/recovery policy.
5. Owner-email list review and secure server-side migration; owner identities must not remain authoritative in client code.
6. Session revocation, device trust, account recovery, and audit-retention policy.
7. Approved CORS origins, Content Security Policy, Permissions Policy, and trusted embed origins.

## P0 — TAE production execution

1. Production OpenAI project/API key and approved model configuration.
2. Final TAE system prompt under Master Architect version control.
3. Tool approval/risk classes for autonomous actions.
4. Connector credentials and user-consent flows.
5. Evaluation dataset for intent, tool selection, refusals, and exact Demo Mode behavior.
6. Rate limits, token budgets, failure policy, and human-approval boundaries.

## P1 — Workspace engines

The runtime shells are registered, but these require their specialized production implementations:

- Interweb browser isolation, navigation policy, downloads, and history
- Chat/Terminal streaming transcript and command execution sandbox
- Plan timeline, approval graph, and autonomous workflow persistence
- Build Canvas code editing, preview, export, and deployment pipeline
- Infinite Canvas node model, connections, zoom, pan, selection, and collaboration
- J A . i Scribe document/video/code extraction and editing skill set
- Loop Station Web Audio engine, tracks, recording permissions, export, and latency calibration
- Files provider adapters, search, preview, versioning, and recovery
- Media playback, uploads, transformations, and rights metadata
- Settings registry and device-specific controls
- Visual Realization Studio and Camera workspaces

## P1 — Device and local-first capabilities

- File System Access adapter and iOS-compatible fallback
- camera and microphone permission UX
- notifications and background-sync policy
- clipboard governance
- share-target and file-handler PWA declarations
- Bluetooth/BLE device bridge
- contacts, calendar, and location consent flows
- multi-device handoff and conflict resolution
- encrypted offline store
- backup, restore, export, and deletion
- real weather/environment provider and fallback assets

## P1 — Commerce and entitlement

- final product IDs and prices
- Stripe webhook destination and signing secret
- Apple Pay, Google Pay, PayPal, and Cash App scope decisions
- entitlement matrix for Home, TAE, Chat, Plan, Build, and later capability packages
- wallet/RGC contract if retained
- invoices, refunds, tax, regional availability, and failed-payment behavior

## P1 — Deployment

- final frontend and API domains
- Cloud Run project, region, service account, secrets, and database network path
- object storage/CDN for video, HDRI, images, and user media
- production monitoring, traces, logs, alerts, and incident ownership
- database migration/rollback rehearsal
- disaster recovery targets
- privacy policy, terms, data-processing terms, and deletion workflow

## Required acceptance evidence

Before calling the desktop visually exact, provide:

1. screenshot comparisons at iPhone 15 `393×852`, 9:16 portrait, 16:9 desktop, and 48:9 ultra-wide
2. video comparison of boot, dock formation, workspace materialization, portrait swipe, rotation continuity, and dismissal
3. frame-time and memory traces
4. keyboard, screen-reader, contrast, reduced-motion, and touch-target results
5. offline/reconnect and multi-device continuity results
6. API schema and authorization test results
7. signed Master Architect conformance report
