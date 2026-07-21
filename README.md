# Agentic OR — TAE Backend

Production runtime for the Agentic OR intelligence layer.

## Architecture

Single FastAPI backend (`app/`) serving:
- `/api/*` — legacy compatibility routes (existing frontend)
- `/api/v1/*` — new production API (auth, billing, TAE, admin)
- `/ws` — WebSocket real-time state stream

Frontend: React 19 + Vite + TypeScript + Tailwind + shadcn/ui + Three.js/R3F

## Quick Start

### Docker (recommended)
```bash
cp .env.example .env  # Fill in your secrets
docker compose up --build
```

### Local dev
```bash
uv sync
bun install
./start.sh  # Starts FastAPI + Vite dev server
```

## Database Setup

```bash
# Create tables from Alembic migration
alembic upgrade head

# (Optional) Migrate data from old Prisma tables
python scripts/migrate_from_prisma.py
```

## Environment Variables

See `.env.example` for all required variables. Critical:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Strong random secret for JWT signing
- `OPENAI_API_KEY` — For the TAE orchestrator
- `SIOS_ENABLE_DB=1` — Enable database persistence

## Deployment

The `render.yaml` deploys via Docker with a managed PostgreSQL database.
Health check: `GET /api/v1/health`

## Migration Status

This branch (`migration/production-cutover`) implements the TAE Production
Migration Plan. The Express backend has been removed; all endpoints now
live in FastAPI under `app/`.
