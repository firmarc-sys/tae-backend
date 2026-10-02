# UAE Tool Fabric v1

The Tool Fabric is the executable layer beneath TAE-resolved deity authority.

Canonical path:

```text
HUMAN
→ JAHORIN
→ TAE
→ MA’AT
→ DEITY
→ TOOL
→ ARI
→ PROVIDER / DEVICE / PERSISTENCE
→ RESULT
→ TAE CONTINUITY
→ MERCURY
→ JAHORIN REMAINS
```

## Contract

Every production deity tool must declare:

- stable `tool.id`
- canonical `deityId`
- ARI `capability`
- concrete `operation`
- description
- side-effect classification
- input schema
- output schema
- authority metadata

Universal authority is not reimplemented by a deity:

```text
resolver      = TAE
authority     = MaAt
execution     = ARI
manifestation = Mercury
```

`src/lib/toolFabric.ts` owns the shared client contract. A deity defines only its tool set under `src/deities/tools/`.

## Thoth — reference implementation

Thoth is the first complete Tool Fabric implementation and defines exactly eight tools:

| Tool | ARI operation | Durable side effect |
| --- | --- | --- |
| `create_document` | `document.create` | yes |
| `update_document` | `document.update` | yes |
| `transcribe` | `document.transcribe` | yes |
| `summarize` | `document.summarize` | no |
| `rewrite` | `document.rewrite` | conditional / yes |
| `extract` | `document.extract` | no |
| `search_documents` | `document.search` | no |
| `export_document` | `document.export` | no |

The UAE frontend sends a typed Tool Fabric envelope to ARI. The production ARI backend recognizes Thoth tool IDs, applies the existing GID/governance chain, stores durable artifacts and tool audit events in Neon, and uses the existing Scribe provider path for intelligence transformations.

Browser-local Papyrus state remains an offline/latency-friendly editing buffer. A successful ARI document response is authoritative durable state and is reconciled back into the same Scribe experience.

## Backend persistence template

The backend uses generic UAE tables rather than deity-specific tables:

```text
uae_artifacts
- id
- gid
- deity_id
- artifact_type
- title
- content
- version
- metadata
- created_at
- updated_at

uae_tool_events
- request_id
- gid
- deity_id
- tool_id
- operation
- status
- artifact_id
- metadata
- created_at
```

This allows later deities to reuse the same durable fabric while defining different artifact types.

Examples:

```text
Ptah   → code-artifact / build / project
Horus  → capture / analysis / visual-artifact
Hathor → audio-session / composition / mix
Seshat → temporal-record / timeline
Athena → strategy / decision-artifact
```

## Template for the remaining 103

For each deity:

1. Create `src/deities/tools/<Deity>Tools.ts`.
2. Define the smallest real set of executable tools required by the deity's DeityML jurisdiction.
3. Use `defineDeityTool` and `defineDeityToolSet`; never create a parallel gateway contract.
4. Route every remote/provider action through ARI.
5. Use an existing authorized provider operation for intelligence subcalls when possible.
6. Store durable outputs as typed `uae_artifacts` where persistence is required.
7. Record every accepted or failed execution in `uae_tool_events`.
8. Preserve TAE resolution and Ma’at authority metadata in the execution context.
9. Return a canonical Tool Fabric result envelope.
10. Reconcile the result into the deity's existing Mercury manifestation rather than opening a separate application.

A deity is not complete merely because a tool name exists. A production tool must have a real executable implementation, an authority path, typed input/output, truthful failure behavior, persistence/audit semantics when applicable, and verification.

## Status language

- **DEFINED** — typed tool contract exists.
- **WIRED** — UAE sends the request and ARI recognizes it.
- **VERIFIED** — repository verification proves contract/runtime behavior.
- **LIVE** — deployed ARI responds successfully using production services.
- **GA** — live behavior also satisfies security, reliability, observability, cost, and release gates.

Do not use **LIVE** or **GA** merely because the frontend renders the tool.
