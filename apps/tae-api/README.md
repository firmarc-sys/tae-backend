# TAE API scaffold

This reserves the target location for a separately deployed, versioned TAE control-plane API. It is not wired into the root ARI deployment.

Before adding a production entry point: inventory route/auth contracts; choose the framework; implement verified identity and tenant context; enforce authorization, validation, rate limiting and redacted audit logs; use the existing authoritative database; add truthful readiness checks; create a separate build/deploy workflow and staging service; add contract, integration and tenant-isolation tests.

Do not point the live frontend or production hostname at this scaffold.
