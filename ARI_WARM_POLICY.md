# ARI Warm Floor Policy

GA latency law: the public ARI Cloud Run service must maintain a service-level minimum of one warm instance so GID authorization does not depend on scale-from-zero startup.

This does not weaken identity, UAE governance, Ma’at authorization, or session controls. It changes only production availability/latency.

Canonical floor: `min instances = 1`.
