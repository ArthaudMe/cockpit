# Testing And Validation

## Core Gate

Run before merging normal changes:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Focused Tests

- Provider registry or agent command changes:
  `pnpm test -- src/lib/__tests__/provider-registry.test.ts`
- Agent env changes:
  `pnpm test -- src/lib/__tests__/agent-env.test.ts`
- Hook/event server changes:
  `pnpm test -- src/lib/__tests__/claude-hooks.test.ts src/lib/__tests__/agent-event-server.test.ts`
- Parser/render-block changes:
  `pnpm test -- src/lib/__tests__/parser.test.ts`
- Datasource cache/history changes:
  run the closest `src/lib/__tests__/*.test.ts` file plus `pnpm typecheck`.

## Datasource Connection Smoke

For every UI, OAuth, release, onboarding, or packaged-app validation pass, include
a datasource connection smoke test before calling the build launch-ready:

1. Run Cockpit locally.
2. Use Playwright to open the app, navigate to onboarding or Settings, and click
   at least one OAuth-backed datasource connect button.
3. Verify one of these outcomes:
   - the provider authorization page opens, or
   - Cockpit blocks before navigation with a specific OAuth proxy/config error.
4. When credentials/test accounts are available, complete one provider OAuth
   end-to-end and verify `/api/datasources` reports it as connected.

Do not accept a generic "Connection failed" callback page as a passing result.
The provider/proxy error must be visible enough to diagnose the failure.

## Known Gaps

- `pnpm lint` is not a reliable gate until the deprecated `next lint` script is
  replaced with an installed linter.
- There are no committed Playwright/Electron smoke tests yet. For UI and
  packaged-release work, include the datasource connection smoke result in the
  manual test notes.
