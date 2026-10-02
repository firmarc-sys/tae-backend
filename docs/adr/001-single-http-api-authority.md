# ADR 001: Single HTTP API authority

- Status: Proposed
- Context: The repository has a deployed Node/Express ARI gateway and legacy Python/TypeScript route files.
- Decision: Treat the existing ARI gateway as production authority until a separately deployed TAE control-plane API passes staging checks and an explicit cutover is approved.
- Consequences: New API code gets a separate service/deployment target. Parallel implementation does not mean a route has migrated.