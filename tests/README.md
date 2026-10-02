# Cross-service test plan

Required release gates: API/worker contract compatibility; auth and authorization deny paths; cross-tenant read/write and object access rejection; capability grant/approval/revocation; duplicate queue delivery and idempotent execution; crash/lease/retry/dead-letter recovery; cancellation and compensation; memory consent/retention/deletion; provider permission failures and truthful readiness; staging smoke tests and rollback rehearsal.

A listed test is not passing until executable tests exist and CI reports success.
