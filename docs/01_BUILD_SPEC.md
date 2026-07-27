# Agentic Mercury TimeRunner — Production Build Spec

## Runtime composition

`MercuryDesktop` owns the persistent environment. `WorkspaceRail` semantics are implemented by the three mounted workspace surfaces. In landscape, all three are visible. In portrait, CSS translates the rail in viewport-sized increments without remounting the desktop runtime.

## Workspace contract

Each workspace declares:

- stable ID and route
- label and Liquid Dock glyph
- default left, center, or right spatial slot
- description
- component implementation
- command and navigation adapters

Workspaces do not create a second application shell or router.

## State

Active route, desktop icon positions, and runtime preferences persist locally. Backend state arrives through the existing WebSocket runtime context. REST is the fallback. The canonical Demo Mode transition is deterministic at the backend.

## Rendering

The included runtime uses a dependency-free CSS mercury renderer so the information architecture survives without WebGL. The existing R3F renderer remains available for future shader replacement. WebGL must be progressive enhancement, not a requirement for navigation.

## Performance targets

- first shell paint: under 1.5 seconds on a current mid-range mobile device
- interactive desktop: under 3 seconds
- steady-state animation: 60 FPS target, 30 FPS minimum
- no route-induced full runtime remount
- no unbounded event, audio, timer, or WebGL resource accumulation

## Accessibility

- labeled dock, status, workspace, launcher, and route controls
- keyboard-operable controls
- reduced-motion mode
- no false battery or network data
- contrast preserved on chrome surfaces

## Deployment

The Vite build is served by the existing FastAPI static fallback. The package also supports static PWA hosting when API URLs are proxied to the backend.
