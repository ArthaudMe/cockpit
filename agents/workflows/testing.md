# Testing And Validation

## Core Gate

Run before merging normal changes:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For release-adjacent, OAuth, Electron, or packaged-app changes, run the broader
local release verification gate:

```bash
pnpm release:verify
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
a datasource connection smoke test before calling the build launch-ready.

Automated smoke:

```bash
pnpm smoke:datasources
```

This starts the production standalone server with a temporary local API token and
verifies:

- core protected API routes answer successfully;
- Google, Slack, Linear, GitHub, and Notion connect routes return provider
  authorization URLs rather than generic callback failures.

Manual/UI smoke is still required when changing onboarding or Settings UI:

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

## Packaged Mac Smoke

For Electron packaging changes, run:

```bash
pnpm smoke:packaged
```

This validates the signed macOS app layout, verifies `codesign`, ensures the
Next standalone server is outside `app.asar`, and starts the packaged standalone
server with a protected API request. For a local GUI launch check, use:

```bash
pnpm smoke:packaged:launch
```

## Known Gaps

- `pnpm lint` is not a reliable gate until the deprecated `next lint` script is
  replaced with an installed linter.
- `pnpm smoke:datasources` starts the production standalone server and verifies
  OAuth connect URL generation for Google, Slack, Linear, GitHub, and Notion,
  including that Google routes through Composio. It does not complete
  provider-hosted OAuth unless test accounts are supplied.
- `pnpm smoke:packaged` verifies the built macOS app layout, code signature,
  and packaged standalone server startup. Use `pnpm smoke:packaged:launch` when
  a GUI launch check is also needed.
- `pnpm smoke:packaged:launch` opens the macOS app and is local/manual only; CI
  should use `pnpm smoke:packaged`.
