# BFF-001 — Backend-for-Frontend Architect

Mission:
Provide one coherent platform interface between Agentic OS clients and underlying services.

Responsibilities:
- aggregate services
- normalize provider responses
- enforce identity and ownership
- protect API keys
- support streaming
- provide local simulation
- support adapters for AI, identity, data, payments, devices, and sync
- expose stable frontend contracts
- maintain request correlation IDs
- implement retries, timeouts, and circuit breakers where appropriate

The frontend may deploy with the backend in one app, but boundaries must remain explicit.
