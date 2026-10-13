# Nova Life deployment

This mission does not deploy, migrate production, change DNS, or shift Cloud Run traffic.

## Current public development shape

- Repository: `firmarc-sys/tae-backend`
- Branch: `nova-life/live-beta`
- Do not merge to `main` until a separate promotion is authorized. A push to `main` triggers production Cloud Run workflows.
- Do not write to `firmarc-sys/UAE`.

## Bluehost target

Bluehost is the intended application host. Google remains the inference provider. Suggested layout, not applied here:

```
users -> Bluehost VPS
  reverse proxy
  frontend
  TAE/UAE runtime
  n8n
  workers
  persistent volume at NOVA_LIFE_STATE_DIR
  -> Google Vertex / Gemini / image / Veo
```

Set `NOVA_LIFE_ENABLED=false` on any production ARI revision until promotion is explicitly authorized. The route group then returns 404.

Health: `GET /api/nova-life/health` and `GET /api/nova-life/orbit`. Neither mutates the world. Orbit is the signed-out planet contract.

## Persistence choice

- Sandbox and Bluehost without Neon: `NOVA_LIFE_PERSISTENCE=file` and a durable `NOVA_LIFE_STATE_DIR`.
- Shared Postgres: apply `sql/2026-10-13_nova_life_live_beta.sql` to a non-production database, then set `NOVA_LIFE_PERSISTENCE=neon`.
- The process does not create tables automatically.

## GCP

Active TAE/ARI endpoint discovery was not run. `gcloud config set` would mutate local project config and is outside this mission's production-safety boundary. Existing repository documentation names `https://ari-689058655022.us-west1.run.app` as the production ARI hostname. That hostname was not called and was not modified.

## Rollback

- Code: reset the feature branch or revert its commits. Production `main` is unchanged until a human merges it.
- World state: call rollback for the contributing GID, or restore the previous `world.json` / database documents. Lineage remains.
- Feature: `NOVA_LIFE_ENABLED=false`.
