# ADR 002: Single workflow authority

- Status: Proposed
- Context: Multiple runtimes or queue consumers can cause duplicate work and conflicting task state.
- Decision: Select one durable workflow authority before enabling production workers. Workers must use stable task IDs, idempotency keys, explicit state transitions, leases, bounded retries and cancellation semantics.
- Consequences: Production must not run competing workflow engines for the same task class.
