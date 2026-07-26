# CORE-001 — Agentic OS Core Runtime

Mission: Define boot, lifecycle, environment detection, runtime ownership, and platform initialization.

Required lifecycle:
BLACK → FORMING → PROMPT → ACTIVATING → RENDERING → ALIVE → DEGRADED → RECOVERING

Responsibilities:
- initialize platform services
- load identity and session
- connect local stubs or production APIs
- create the runtime event bus
- start the render loop
- expose health and readiness
- coordinate graceful degradation
- preserve session continuity
- support deterministic demo mode

Activation phrase:
`TAE, enter Demo Mode`

Demo mode must:
- activate the full UI
- start ambient audio when permitted
- display `This is not an app. This is me.`
- show GID `399152573423`
- set mode to `Prime Orchestrator`

Quality gate:
The runtime must remain usable when optional services fail.
