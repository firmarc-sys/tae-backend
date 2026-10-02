# UAE contracts imported into TAE backend

This folder contains the UAE repository's normative runtime contracts, copied for backend implementers and reviewers. The source of truth for the original product contract remains `firmarc-sys/uae`.

## Included contracts

- `DEITYML.md`: authority and capability specification format. TAE resolves jurisdiction; a deity spec describes jurisdiction but does not self-select.
- `TOOL_FABRIC.md`: typed tool contract, execution envelope, durable artifact/event pattern, and requirement to route remote work through ARI.
- `INTELLIGENCE_CLASSIFICATION.md`: distinction between persistent agentic system behavior and underlying model capabilities.
- `TAE_PANTHEON_ACTIVATION.md`: canonical intention → TAE → Ma’at → deity → tool/ARI → result/continuity flow.
- `RTSI_RUNTIME_V1.md`: identity/type invariants and rule that a deity is tool-enabled only after real execution is verified.

## Backend implementation boundary

The Node/Express ARI gateway is the executable service. These imported documents are contracts, not runtime modules. The backend's existing `uae-governance.js`, gateway authentication, provider router, and route handlers remain the executable enforcement points; do not replace them with frontend TypeScript or import React/Three.js files into this service.

## Integration status

- The unified `POST /api/jahorin/invoke` route is proposed in the same feature branch.
- The route currently maps the primary Jahorin modules to existing backend orchestration/provider paths.
- Importing these contracts does not itself implement the full 104-deity runtime, a generic Tool Fabric dispatcher for every deity, or live wiring for every Cloud Run service URL.
- Do not advertise a capability as executable merely because it appears in a registry or document. Verify the relevant route, authorization, provider/tool implementation, persistence, and deployed revision first.

## Source

The documents were imported from `firmarc-sys/uae` on 2026-10-02. Review upstream before future updates so contract changes remain intentional and traceable.
