# Nova Life environment

Names only. Secret values belong in the host secret store, never in git.

| Name | Purpose |
| --- | --- |
| `NOVA_LIFE_ENABLED` | `true` in sandbox. Set `false` on production until promotion is authorized. |
| `NOVA_LIFE_PERSISTENCE` | `file`, `memory`, or `neon`. |
| `NOVA_LIFE_STATE_DIR` | Durable directory for file persistence. |
| `NOVA_LIFE_WORLD_ID` | Default `pangea-valley`. |
| `NOVA_LIFE_BETA_GIDS` | Comma-separated server allowlist. Not a client flag. |
| `SIOS_OWNER_GID` | Existing owner GID. Owner sessions are authorized. |
| `NEON_DATABASE_URL` or `DATABASE_URL` | Existing Neon URL, used only when persistence is `neon`. |
| `N8N_BASE_URL` | Existing n8n origin. |
| `N8N_API_KEY` | Server-only n8n credential. Placeholder in `.env.example` is `secret_manager:n8n-api-key`. |
| `GOOGLE_CLOUD_PROJECT` | Existing Vertex project setting. Never sent to the browser. |
| `GOOGLE_CLOUD_LOCATION` / `VERTEX_LOCATION` | Existing Vertex location. |

Nova Life does not add a browser credential, a new session cookie, or a new access code.
