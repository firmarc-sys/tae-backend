# Canonical Tech Stack

## Backend runtime

- Python 3.11+
- FastAPI
- Uvicorn
- WebSockets
- SQLAlchemy
- Alembic
- PostgreSQL / Neon-compatible PostgreSQL
- OpenAI-compatible tool-calling client for TAE orchestration
- Docker
- Cloud Run-compatible deployment

The FastAPI runtime is the source of truth for TAE commands, GID identity, render state, Syncori state, IoT/device state, capability execution, and real-time synchronization.

## Mercury client

The production client architecture is:

- React 19
- Vite
- TypeScript
- React Router
- PWA manifest and service worker
- Three.js / React Three Fiber / WebGL / GLSL where required
- CSS fallback for devices without WebGL

A self-contained single-file `index.html` may be used for the immediate demo runtime. That demo must have embedded CSS and JavaScript, no external dependencies, and local JSON-compatible stubs for `/api/tae`, `/api/render-state`, `/api/iot`, `/api/syncori`, and `/api/identity` when the live backend is unavailable.

## Visual implementation rules

The Living Intelligent Crystal is the sole UI origin and dominant visual element.

Required:

- black void background from `#000000` through `#010205`
- pure mercury chrome
- high-contrast reflective bands
- continuous breathing and viscous motion
- upward formation flow and ripple-pool behavior
- interface surfaces that emerge from and return to the Living Intelligent Crystal
- continuous render loop across `IDLE`, `ACTIVE`, `GENERATE`, and `DEMO`

Forbidden in the canonical runtime:

- frosted glass
- backdrop blur
- flat cards or dashboard panels
- hard-edged application chrome
- cartoon outlines
- static decorative chrome that does not respond to runtime state

## Responsive viewport contract

- Mobile-first target: iPhone 15-class viewport, `393 × 852` CSS pixels
- Portrait: `9:16`, center workspace only
- Standard landscape: `16:9`
- Ultra-wide desktop: `48:9`, three portrait workspaces visible simultaneously
- One DOM and one state model across orientation changes
- Rotation must not reset runtime state
- Horizontal panning only where the 48:9 world exceeds the physical viewport
- Liquid Dock remains anchored to the physical bottom edge

## Routing and workspaces

Full-screen workspace routes include Interweb, Live Chat, Terminal, Loop Station, Infinite Canvas, Typenoter, Whiteboard, Files, Media, Browser Tabs, Camera, Recorder, Calculator, Clock, Calendar, Weather, and Settings.

These are spatial workspaces, not card-based dashboard widgets.

## Package discipline

- Do not add a dependency when the platform or browser already provides the required capability.
- Do not edit lockfiles manually.
- Do not commit secrets.
- Preserve existing conforming code before replacing or restructuring it.
- Every implementation change must be checked against the architecture, API contract, identity model, material system, motion system, routes, and app manifests.