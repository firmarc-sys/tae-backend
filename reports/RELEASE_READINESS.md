# Release Readiness

Build date: 2026-07-27  
Package: Agentic Mercury TimeRunner 1.0.0

## Passed

- active TypeScript source lint
- TypeScript project compilation
- Vite production build
- Mercury structural contract validation
- FastAPI health test
- deterministic TAE Demo Mode contract test
- Python bytecode compilation
- PWA manifest and icon presence
- production output generation in `dist-live/`

## Test result

```text
Mercury structural validation: passed
Vite production build: passed
Python API tests: 2 passed
Python compileall: passed
```

One upstream `passlib` warning reports Python's deprecated `crypt` module. It does not fail the current runtime, but the password-hashing dependency must be updated before Python 3.13 deployment.

## Release classification

**Functional production scaffold / exact-fidelity blocked by canonical inputs.**

The runtime is deployable as an interactive desktop demo and backend integration build. Exact visual conformance remains blocked by the P0 items in `MISSING_AND_NEEDED.md`, especially the latest canonical desktop images, boot/dock video, geometry measurements, shader/material values, and approved audio.
