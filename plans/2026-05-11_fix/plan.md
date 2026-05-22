# Context
The user wants the app fixed now. The latest concrete artifact is a standalone Viktor-style HTML controller that defines the intended runtime behavior: page selector, command routing, demo mode, and per-page content blocks for Command Center, Galactic Identity, Syncori Render Engine, IoT Field, AlphaBeta Program, NovaLife / Vulgate, and TAE Runtime. The existing SIOS app already has a React/FastAPI runtime shell, owner identity, portrait framing, and orb/cinematic flow. The fix is to align the current app with the provided page-selector behavior without redesigning the visual identity.

# Scope & Non-Goals
- Scope: wire the provided page options and command routing into the existing runtime; ensure the active page selector and command input resolve to the same page state; preserve owner identity/GID 399152573423 and Prime Orchestrator behavior; keep the orb/liquid-chrome aesthetic; make the page surface visible and functional.
- Non-goals: no backend persistence work, no new auth system, no redesign, no documentation changes.

# Implementation Plan
1. Inspect the current runtime flow in `src/App.tsx`, `src/components/RuntimeShell.tsx`, `src/lib/runtimePages.ts`, `src/lib/runtimeAccess.ts`, `src/lib/identity.ts`, and any command/TAE helpers to map the existing state model to the requested page-selector behavior.
2. Update the runtime page definitions so the page list matches the provided options and content blocks: Command Center, Galactic Identity, Syncori Render Engine, IoT Field, AlphaBeta Program, NovaLife / Vulgate, and TAE Runtime.
3. Add or adapt command routing so keywords like `identity`, `syncori`, `iot`, `alpha`, `nova`, `vulgate`, `tae`, `runtime`, `dashboard`, and `command` resolve to the correct page.
4. Ensure the runtime shell renders the active page clearly in the portrait frame, with the orb remaining the source/centerpiece and the page surface visible rather than hidden.
5. Keep owner unlock behavior intact so the owner identity and GID still activate the owner runtime state.
6. Verify by building the frontend and checking that the runtime compiles cleanly and the page routing behaves as expected.

# Verification
- Run `bunx --bun vite build` and confirm it succeeds.
- Sanity-check the page routing and selector behavior in the runtime shell.
- If needed, start the app with `bash start.sh` and confirm the runtime loads without blank-screen errors.