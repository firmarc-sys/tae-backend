# Free API Configuration

The committed `.env.example` defaults Agentic Mercury TimeRunner to a zero-cost development configuration.

## Works without external credentials

- deterministic local TAE command fallback
- browser speech, audio, camera, recording, screen capture, location, sharing, offline storage, and supported device APIs
- National Weather Service endpoints
- USGS earthquake data
- Frankfurter currency reference data
- OpenStreetMap data with public-service usage restrictions
- MusicBrainz, Cover Art Archive, and Open Library with documented throttling
- NASA and NREL exploration through their public `DEMO_KEY`

## Requires a free account

- Supabase project URL and anonymous key
- Gemini API key
- NASA developer key for more than demonstration traffic
- NREL developer key for more than demonstration traffic

## Secret boundary

Only variables prefixed with `VITE_` may enter the frontend bundle. Service-role keys, AI keys, JWT secrets, database credentials, and payment credentials remain backend-only.

The public `.env.example` contains no production credentials. Copy it to `.env` locally and populate secrets through the deployment platform’s secret manager.

## Commercial-use review

Before commercial launch, re-check the current terms for Open-Meteo, Nominatim, OpenStreetMap tiles, MusicBrainz, Cover Art Archive, Open Library, NASA, NREL, and every other third-party dataset. Free public infrastructure must be cached, throttled, attributed, and replaceable through provider adapters.
