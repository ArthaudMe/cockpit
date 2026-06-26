# AGENTS.md

This is the root guide for coding agents working on Cockpit. Treat it as the
agent-facing companion to `README.md`: keep it focused on commands, ownership
boundaries, release rules, and areas where mistakes are expensive.

When working in this repo:

- Start with this file.
- Read only the relevant `agents/` topic page for the area you are changing.
- Prefer updating the smallest relevant `agents/` page over expanding this file.
- If nested `AGENTS.md` files are added later, the closest file to the edited path wins.
- Explicit user or maintainer instructions override this file.

## Project Overview

Cockpit is a local-first Electron + Next.js desktop app for founders. It connects
to live company tools, builds context, and routes chat through local CLI agent
backends such as Claude, Codex, and Ollama.

The app runs a packaged Next.js standalone server on `127.0.0.1`, then loads it
inside an Electron renderer. API routes are still used for renderer-visible app
actions, so security-sensitive route changes must consider both browser callers
and other local processes.

## Repository Structure

- `src/app/` - Next.js app router, page shell, and API routes.
- `src/components/` - React UI columns, views, renderers, and shared UI cards.
- `src/lib/` - Agent runtime, provider registry, datasource connectors, actions,
  search, memory, project inference, and persistence helpers.
- `electron/` - Electron main process and preload bridge.
- `scripts/` - Build, standalone packaging, and release support scripts.
- `proxy/` - Vercel OAuth token-exchange proxy.
- `landing/` - Static marketing/download page.
- `.github/workflows/` - CI and release workflows.
- `agents/` - Agent-facing architecture, workflow, and risk docs.

## Core Commands

Use `pnpm`.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm electron:build
```

`pnpm lint` is currently not a reliable validation gate because the script still
uses deprecated `next lint` and this workspace does not install ESLint. Do not
claim lint passed unless the lint setup has been repaired.

## Read Next

- Architecture changes: `agents/architecture/overview.md`
- Security-sensitive API, Electron, OAuth, or spawned process changes:
  `agents/risky-areas/security.md`
- Desktop packaging, signing, notarization, or website download changes:
  `agents/workflows/release.md`
- Provider/backend changes: `agents/conventions/providers.md`
- Test or validation changes: `agents/workflows/testing.md`

## High-Risk Rules

- Do not start agent runtimes or spawn CLI processes at module import time.
  Next build imports route modules during collection.
- Do not pass unsanitized `process.env` to spawned agent processes. Use
  `buildAgentEnv()`.
- Do not add powerful API routes without checking the local API token middleware
  and CSRF behavior.
- Do not weaken Electron isolation settings casually.
- Do not publish a macOS DMG unless notarization, DMG stapling, and mounted-app
  Gatekeeper verification have passed.
- Do not commit `.env.local`, token files, caches, generated release artifacts,
  or local app data.

## Current Validation Gate

Before merging normal code changes, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For release changes, also run the relevant release script from
`agents/workflows/release.md`.
