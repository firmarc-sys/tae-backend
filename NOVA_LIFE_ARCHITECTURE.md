# Nova Life architecture

Nova Life Live Beta is a shared developmental world on the existing TAE/ARI GID session. Jahorin remains the personal intelligence environment. UAE remains the canonical private backend. This repository is the public development workspace.

Canonical phrase: EXPLORE. BUILD. EVOLVE.

## What this is not

Nova Life does not add a login, a GID issuer, a policy engine, or a second UAE. Signed-out users receive the orbit contract. Ground entry requires an authenticated GID that the server authorizes. Query parameters, request bodies, and `localStorage` cannot grant access.

The visual reference shows a GID panel. That panel maps to the existing ARI session (`POST /api/identity/session`, guest session, or member bearer). `Create a new GID` is not implemented here.

## Experience routing

```
unauthenticated -> orbit
authenticated without nova-life access -> jahorin
owner, entitlement, or NOVA_LIFE_BETA_GIDS -> nova-life-live-beta
```

First authorized entry returns the full descent sequence. Later entries return the shortened return sequence. The voice dock modules are Interweb, Forge, Code, Scribe, and Optics. Augment is not a top-level module.

## Persistence

`nova-life/store.js` selects memory, file, or Neon.

- File mode is the Bluehost/sandbox default and survives process restart when `NOVA_LIFE_STATE_DIR` is on a persistent volume.
- Neon mode uses additive tables in `sql/2026-10-13_nova_life_live_beta.sql`. It does not run DDL at startup and must not be applied to production during this mission.
- Existing `nova_worlds` rows are not overwritten by the new document store.

Accepted Nova Life objects belong to `nova-life`, keep `contributor_gid` and `origin_contributor_gid`, and append lineage. Rollback writes a new lineage entry. It does not delete history.

Jahorin's scope is `personal`, owned by the authenticated GID, and is not inserted into the shared world.

## Forge

Spatial intents compile to a preview through the forge spatial compiler. Lifecycle: INTENT, PLAN, GENERATE, PREVIEW, MODIFY, TEST, ACCEPT, PERSIST, VERSION. Build mode and Play mode share the world. Play mode does not mutate the shared world. Accept runs Thoth, then persists.

Google enrichment is used only when a server-side Vertex router is injected. If it is absent, Forge still compiles and records `generator: forge-spatial-compiler`. It does not invent Gemini text.

## Providers, n8n, Thoth, Ma'at

`GoogleVertexProvider` is the only generative adapter. Browser responses expose provider name, model, and text. They do not include credentials. Image, video, vision, and embed fail closed when the router method is absent.

n8n may dispatch `world.maintain`, `beta.automation`, and `forge.background`. It cannot grant GID, policy, or permissions. UAE stays authoritative. Unconfigured n8n returns `blocked`, not a fake completion.

Thoth rejects missing contributors, scope mismatches, secret material, protected-system instructions, and canon overwrites.

Ma'at blocks spending, external messages, production deploy, permission escalation, sensitive disclosure, protected infrastructure changes, and destructive deletion of major shared assets unless a human approval id is recorded. Ordinary creative sandbox work stays fluid.

## Regions

Pangea Valley is the populated arrival region. Forge, Archive, Code Citadel, Observatory, Interweb Gate, Commons, Proving Grounds, Wild Zone, and Horizon are addressable and mostly unpopulated. Distant landmarks imply a larger planet.
