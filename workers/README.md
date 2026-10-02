# TAE workers: target layout

These are planned execution boundaries, not proof of deployed workers. Each worker needs a dedicated service identity, least privilege, validated messages, idempotency, retry/dead-letter handling, cancellation, structured logs and audit correlation. Never execute untrusted code in the API process. Ptah execution requires an isolated sandbox and default-deny network policy.
