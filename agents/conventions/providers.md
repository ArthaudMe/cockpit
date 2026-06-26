# Provider And Agent Backend Conventions

Provider metadata lives in `src/lib/provider-registry.ts`.

## Rules

- Add or change a backend in the provider registry only. API routes and UI should
  consume registry helpers instead of hardcoded backend IDs.
- Keep renderer responses lightweight. Do not expose command builders, binary
  paths, or other implementation-only details from `/api/backends`.
- Describe behavior through explicit `capabilities`:
  - prompt delivery
  - models
  - lifecycle/prewarm
  - hooks
  - image support
  - permissions/auto-approve
  - installation
- Keep command construction test-covered. A bad flag often fails only at runtime
  inside a spawned CLI.
- If a backend needs secrets or custom environment variables, add them to
  `buildAgentEnv()` intentionally. Do not pass through `process.env`.

## Validation Checklist

After provider changes, run:

```bash
pnpm test -- src/lib/__tests__/provider-registry.test.ts
pnpm typecheck
```

If command args, hooks, or prewarm behavior changed, also test a real chat turn in
the packaged or Electron dev app.
