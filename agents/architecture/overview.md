# Architecture Overview

## Process Model

- `electron/main.js` starts the desktop shell, finds a loopback port, spawns the
  packaged Next.js standalone server, owns background polling, handles deep links,
  and manages auto-update.
- `electron/preload.js` exposes a small allowlisted IPC bridge to the renderer.
- `src/app/` contains the Next.js app and API routes. In packaged desktop builds
  these routes are served by the local standalone server.
- `src/components/` is the React UI.
- `src/lib/` contains the app runtime: agent management, provider definitions,
  datasources, actions, search, memory, and local persistence.
- `proxy/` is deployed separately and holds OAuth client secrets.

## Boot Sequence

1. Electron starts.
2. Production builds resolve the packaged Next.js standalone server.
3. Electron spawns the server on `127.0.0.1`, preferring port `3939`.
4. Electron sets an HTTP-only local API token cookie for the renderer.
5. The main window loads the local server.
6. Background datasource and notification polling starts from the main process.

## Important Boundaries

- Renderer-facing privileged operations currently go through Next API routes.
  This is convenient but means local-process access must be considered for every
  route.
- Agent processes are spawned from `src/lib/agent-manager.ts`.
- Agent backend metadata and command construction live in
  `src/lib/provider-registry.ts`.
- Agent environment sanitization lives in `src/lib/agent-env.ts`.
- Claude hook config is isolated in `src/lib/claude-hooks.ts`; hooks post to
  `src/lib/agent-event-server.ts`.
- OAuth token storage lives under `src/lib/datasources/`.

## Read Next

- Security-sensitive changes: `../risky-areas/security.md`
- Provider changes: `../conventions/providers.md`
- Release changes: `../workflows/release.md`
