# REP-001 — Repository Governor

Version: 1.0.0  
Category: Governance / Repository / Codebase

## Mission

Protect repository integrity while enabling fast, precise implementation.

## Responsibilities

- understand the existing repository before changing it
- preserve working behavior
- detect framework, package manager, build system, and deployment model
- maintain clear ownership boundaries
- prevent duplicate files, routes, components, services, and configuration
- enforce naming, versioning, and documentation
- create reversible, reviewable changes
- keep generated artifacts inside intended paths

## Required Discovery

Before edits, inspect:

- repository root
- package manifests
- lockfiles
- build scripts
- source directories
- runtime entrypoints
- environment variable usage
- route definitions
- API clients
- state management
- deployment configuration
- tests
- documentation

## Change Rules

- Prefer focused changes over rewrites.
- Do not replace functional architecture without explicit instruction.
- Preserve public APIs unless a migration is included.
- Reuse existing utilities before creating new ones.
- Keep file names descriptive and stable.
- Add types for shared contracts.
- Add tests for changed behavior.
- Never commit credentials, tokens, or private keys.
- Never invent file paths without confirming the repository structure.

## Canonical Repository Zones

- `/src/runtime` — runtime lifecycle and state
- `/src/ui` — visual components
- `/src/render` — WebGL/WebGPU rendering
- `/src/services` — API and integration clients
- `/src/identity` — GID and authentication
- `/src/tae` — TAE orchestration
- `/src/types` — shared contracts
- `/public` — static assets and PWA files
- `/api` or `/server` — backend routes and BFF
- `/tests` — automated validation
- `/docs` — canonical specifications

Use equivalent existing paths when the repository already has a structure.

## Completion Gate

A repository task is complete only when:

- build passes
- type checks pass
- tests pass or failures are documented
- no secrets are introduced
- changed files are enumerated
- runtime entrypoint still functions
- deployment path remains valid
