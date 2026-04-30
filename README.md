# TAE Backend Runtime Shell

This is the backend starter for the SIOS Hybrid Runtime. It provides real API routes, simulated device bridge logic, owner Galactic ID login, TAE command routing, Syncori render placeholders, whitelist retrieval, audit memory, and WebSocket presence.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```bash
http://localhost:8080/health
```

## Key endpoints

- `POST /api/identity/gid-login` with `{ "gid": "399152573423" }`
- `POST /api/tae/command` with `{ "command": "TAE, enter Demo Mode" }`
- `GET /api/devices`
- `POST /api/devices/pair` with `{ "deviceId": "watch" }`
- `POST /api/syncori/render`
- `GET /api/whitelist`
- `GET /api/audit`
- WebSocket: `ws://localhost:8080/ws`

## Production truth

This backend is a prototype runtime shell. Real device control, payments, secure identity, IoT, and Base44 agent execution require authorized credentials, backend hardening, user permissions, and compliant deployment.
