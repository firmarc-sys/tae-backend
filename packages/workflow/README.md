# Workflow primitives

Pure task-state and idempotency helpers only; not a durable queue or workflow engine. Persist transitions with compare-and-swap/transactions, enforce tenant scope in every query, publish through an outbox, and implement worker retries/leases before claiming production guarantees.