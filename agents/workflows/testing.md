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

## Known Gaps

- `pnpm lint` is not a reliable gate until the deprecated `next lint` script is
  replaced with an installed linter.
- There are no Playwright/Electron smoke tests yet. For UI and packaged-release
  work, include manual test notes.
