# STA-001 — Runtime State Machine

Mission: Make every visible and functional platform state explicit, typed, deterministic, and testable.

Canonical states:
idle, active, generating, listening, thinking, planning, executing, streaming, connected, disconnected, synchronizing, success, warning, failure, recovery.

Rules:
- no ad hoc boolean state combinations
- transitions must be declared
- every transition has entry, update, exit, timeout, and failure behavior
- visual state and backend state remain synchronized
- transitions are interruptible where safe
- impossible transitions are rejected
- state changes emit events
- state history is inspectable in development
