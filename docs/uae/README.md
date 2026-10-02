# UAE contracts and deity registry imported into TAE backend

This folder contains UAE normative runtime contracts, copied for backend implementers and reviewers. The source of truth for the original product contract remains `firmarc-sys/uae`.

## Included contracts

- `DEITYML.md`: authority and capability specification format. TAE resolves jurisdiction; a deity spec describes jurisdiction but does not self-select.
- `TOOL_FABRIC.md`: typed tool contract, execution envelope, durable artifact/event pattern, and requirement to route remote work through ARI.
- `INTELLIGENCE_CLASSIFICATION.md`: distinction between persistent agentic system behavior and underlying model capabilities.
- `TAE_PANTHEON_ACTIVATION.md`: canonical intention → TAE → Ma’at → deity → tool/ARI → result/continuity flow.
- `RTSI_RUNTIME_V1.md`: identity/type invariants and rule that a deity is tool-enabled only after real execution is verified.

## Executable registry

- `deity-registry.json` is the canonical data snapshot of all 104 UAE deity entries from `firmarc-sys/uae/src/pantheon/deityRoster.ts`.
- `deity-registry.js` exports the registry, canonical ID lookup, capability aliases, and explicit tool-enabled checks.
- `scripts/test-deity-registry.mjs` checks the 104-entry invariant, unique IDs, alias resolution, and the distinction between registered and tool-enabled deities.

Run the invariant test with:

```sh
node scripts/test-deity-registry.mjs
```

The registry preserves the source roster's `implementation: "manifestation"` field. This means a canonical manifestation is defined in the roster; it does not claim that all 104 deities have production tools or backend execution paths. Per the source contract, only `thoth` is marked tool-enabled until other deities are individually verified.

## Backend implementation boundary

The Node/Express ARI gateway is the executable service. The imported documents are contracts, not runtime modules. The registry module is usable by backend code, but it is not yet wired into every request path or exposed as a public API route. Existing `uae-governance.js`, gateway authentication, provider routing, and route handlers remain the enforcement points; do not import React/Three.js files into this service.

## Integration status

- The unified `POST /api/jahorin/invoke` route is proposed in the same feature branch.
- Importing these contracts and the registry does not itself implement the full 104-deity runtime, a generic Tool Fabric dispatcher for every deity, or live wiring for every Cloud Run service URL.
- Do not advertise a capability as executable merely because it appears in a registry or document. Verify the relevant route, authorization, provider/tool implementation, persistence, and deployed revision first.

## Source

The registry and documents were imported from `firmarc-sys/uae` on 2026-10-02. Review upstream before future updates so contract changes remain intentional and traceable.
