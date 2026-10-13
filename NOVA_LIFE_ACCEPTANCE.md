# Nova Life acceptance

Verified by `npm run verify:nova-life` on branch `nova-life/live-beta`.

| Check | Result |
| --- | --- |
| Baseline gateway syntax (`node --check server.js`) | PASS |
| Nova Life acceptance script | PASS |
| Existing GID session path preserved | PASS |
| Unauthorized GID cannot enter | PASS |
| Authorized beta GID and owner can enter | PASS |
| Client beta flags ignored | PASS |
| First entry and return sequence | PASS |
| Jahorin personal ownership differs from Nova Life world ownership | PASS |
| Contributor GID persists across accept, query, and rollback history | PASS |
| World objects persist | PASS |
| Lineage persists | PASS |
| Rollback restores prior state without deleting history | PASS |
| Forge create and modify | PASS |
| Build mode and Play mode | PASS |
| Google provider is server-side | PASS |
| Provider payload drops credential fields | PASS |
| Image, video, and vision fail closed without a router | PASS |
| Image and video succeed only through an injected server router | PASS |
| n8n path does not claim authority and blocks when unconfigured | PASS |
| Thoth rejects broken contributions | PASS |
| Ma'at blocks protected actions | PASS |
| File store survives a new process-level store instance | PASS |
| Secret scan of Nova Life sources | PASS |
| Production UAE, DNS, and Cloud Run traffic | NOT TOUCHED |

Not claimed:

- Live Vertex image or Veo generation against Google. No credentials were used, and success was not fabricated.
- Live n8n webhook delivery. The contract dispatches only when server env is configured.
- Production Neon migration. The SQL file is additive and unapplied.
- A browser planetary renderer. That belongs to the frontend repository and was not modified.
