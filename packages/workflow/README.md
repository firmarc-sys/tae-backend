# Workflow primitives

This package provides pure state-transition and idempotency-key validation helpers. It is not a durable queue or workflow engine. Persist transitions with compare-and-swap/transactions, enforce tenant scope in every database query, publish through an outbox, and configure worker retries/leases before claiming production workflow guarantees.