# Risky Area: Security

## Main Files

- `electron/main.js`
- `electron/preload.js`
- `next.config.ts`
- `src/middleware.ts`
- `src/app/api/**/route.ts`
- `src/lib/agent-env.ts`
- `src/lib/agent-manager.ts`
- `src/lib/datasources/**`
- `proxy/api/oauth/token.ts`

## Core Risks

- Local API routes can be called by other local processes unless guarded.
- Spawned agent processes can inherit secrets if environment allowlisting is
  bypassed.
- OAuth deep links and callback routes can be abused if query params are
  forwarded without validation.
- Packaged Electron apps can expose source or mutable runtime files if ASAR and
  signing are misconfigured.
- Links rendered from model or datasource output can become `javascript:` or
  other unsafe URLs.

## Rules

- Use `buildAgentEnv()` for every spawned agent or CLI process unless there is a
  documented reason not to.
- Validate request bodies before persisting config, especially MCP server config,
  agent backend/model changes, and action execution.
- Keep Electron `nodeIntegration: false`, `contextIsolation: true`, and renderer
  sandboxing enabled where supported.
- Keep preload APIs narrow and explicit.
- Bind local callback servers to `127.0.0.1`.
- Do not fail open when required secrets are missing.
- Use `safeHref()` for user, model, or API supplied links rendered in Electron.

## Validation Checklist

For security-sensitive changes, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Then inspect the changed routes or spawn sites manually for input validation,
auth/local-token checks, and env allowlisting.
