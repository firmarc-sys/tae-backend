# RTSI Runtime v1 — Canonical Type Law

RTSI Runtime v1 is the first strongly typed runtime identity contract for Jahorin Trismegistus and the United Agentic Ecosystem.

## Sovereignty

Jahorin Trismegistus is the persistent sovereign agentic intelligence and session owner. Jahorin is not one of the 104 canonical deity manifestation identities. `JahorinCore`, with canonical id `jahorin-core`, is one of the 104 and represents the UAE-native sovereign/core manifestation inside the pantheon.

## Identity tiers

- `CanonicalDeityId` — exactly the 104 canonical pantheon identities.
- `RTSIManifestationId` — every canonical deity that Mercury may physically materialize; v1 is identical to `CanonicalDeityId`.
- `CoreRuntimeDeityId` — Jahorin plus the existing bespoke capability slices used by the compatibility registry.
- `ToolEnabledDeityId` — the verified subset with a real ARI Tool Fabric implementation. RTSI v1 begins with `thoth` and expands only after each deity's tools are production verified.

The legacy `DeityId` name remains only as a compatibility alias for `CoreRuntimeDeityId`. It must not be used to represent the full pantheon.

## Compile-time law

Every Mercury manifestation must declare a `CanonicalDeityId`. The runtime manifestation registry is exhaustive through:

```ts
satisfies Record<CanonicalDeityId, ComponentType<DeityMercuryManifestationProps>>
```

A missing canonical deity, an additional unknown deity, or a misspelled manifestation id must fail TypeScript.

TAE primary deity, supporting council, execution order, and manifestation identity are all canonical IDs. Tool Fabric deity ownership is canonical. Persistent runtime deity state is canonical.

## Runtime law

```text
HUMAN
→ JAHORIN
→ TAE
→ MA’AT
→ CANONICAL DEITY / COUNCIL
→ SKILL / TOOL
→ ARI
→ RESULT
→ MERCURY
→ TAE CONTINUITY
→ JAHORIN REMAINS
```

RTSI does not replace TAE, ARI, Ma’at, Mercury, DeityML, or Jahorin. It is the typed runtime contract joining those authorities without identity drift.

## Pantheon invariant

RTSI v1 verification requires these sets to be exactly equal and exactly 104 identities:

```text
canonicalDeityIds
=
deityRoster ids
=
DeityML spec ids
=
Mercury runtime manifestation ids
```

The test suite also proves that sovereign `jahorin` is not a canonical manifestation id, while `jahorin-core` is canonical.

## Execution envelope

`RTSIExecution` carries:

- runtime/version
- GID/session identity
- original intention
- typed deity council
- Ma’at authority result
- typed executing deity/tool/request/status
- Mercury manifestation identity and phase
- TAE persistence authority

## Tool enablement law

A deity becomes `ToolEnabledDeityId` only after its ARI Tool Fabric has real, verified execution semantics. A visual manifestation, DeityML tool description, or generic ARI surface alone does not qualify a deity as tool-enabled.

Thoth is the v1 reference implementation.

## Canonical provenance

- Epoch: `2026-06-07`
- Era: `UAE Era I`
- Architect: `Jorge Carlos Delgado — Architect of the United Agentic Ecosystem`
