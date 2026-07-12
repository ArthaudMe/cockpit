# Cockpit Code Scan — Improvements & ROI

Fable deep-scan of the Cockpit codebase (~25k lines TS/TSX, Electron + Next.js 15 + React 19). Five parallel audits — security/Electron hardening, architecture/code-quality, performance, testing/CI/release, and data-layer/AI-plumbing — plus a dependency and CI pass. Every finding below was verified against current source (HEAD around `efccbe8`), not pattern-matched.

**Bottom line:** the prior security audit (`AUDIT.md`) was substantially remediated — 4/5 criticals and 10/11 highs are genuinely fixed. The remaining risk has moved from "gets you hacked" to "quietly gives users wrong data and silently breaks in the field." The highest-ROI work now is *reliability and trust*, not security: connector error-handling, a red CI that no longer gates, broken macOS auto-update, and a cluster of small parser/memory/timezone bugs that directly garble what the user sees.

Effort key: **XS** <1h · **S** <½ day · **M** ½–2 days · **L** >2 days.

---

## Tier 0 — Do this week (hours of work, outsized payoff)

These are cheap and each one either stops a live regression channel or unbreaks a shipped feature.

### 0.1 The test suite is RED on master, and CI isn't gating
`pnpm test` fails today: `provider-registry.test.ts:120` still asserts `--ephemeral`, which commit `c3ca33d` removed on 2026-07-05. That commit — and three others since — went **directly to master**, not through a PR, despite `.github/workflows/ci.yml` running on PRs. A permanently-red check trains everyone to ignore CI, so real regressions ride in behind the known-red status.
- **ROI:** 15 min (fix the assertion) + repo settings (branch protection requiring the `check` job) restores all meaning to CI and stops the next silent breakage. Highest ROI in the entire scan.
- **Effort:** XS.

### 0.2 macOS auto-update is almost certainly broken for every shipped user
`package.json` `build.mac.target` is `"dmg"` only. `electron-updater` on macOS needs a **ZIP** artifact to apply updates; with DMG-only, `checkForUpdates` errors ("ZIP not provided") — and the error is swallowed by a bare `autoUpdater.on("error", console.error)` inside the packaged app. `upload-github.js:38` even filters for `.zip` assets that are never produced. Net effect: everyone who installs 0.1.0 is stranded on 0.1.0 forever, invisibly.
- **ROI:** ~1 day (add `"zip"` to targets, assert a `.zip` entry in `latest-mac.yml` during the packaged smoke, do one end-to-end update test) unbreaks the entire update mechanism you already ship code for. Without it, every future fix in this document can't reach existing users.
- **Effort:** M.

### 0.3 Four small, verified parser bugs that garble the chat UI
`src/lib/parser.ts` (confirmed empirically by running the real `parseResponse`):
- **Fence without trailing newline → raw JSON shown.** `parser.ts:128-134` does `closeIdx = altIdx - 1`, and the end-exclusive slice drops the final `}`. A message ending in `}` + fence (common) renders the raw `cockpit_render`/`cockpit_action` JSON instead of the table/chart — and action cards never appear, so the action can't run.
- **Memory-only reply shows the memory JSON.** `parser.ts:220` returns the raw text when all segments were consumed; a "noted silently" reply displays the `cockpit_memory` block verbatim.
- **Unclosed fence → eternal spinner hiding all trailing text.** `parser.ts:137-144` emits a permanent loading block; on a truncated turn (285s timeout) the user sees a spinner forever.
- **Hyphenated skill tags break.** `parser.ts:113` uses `\w`, but custom skills slugify to `/weekly-report`; every multi-word custom skill leaks `[skill: /weekly-report]` as visible text and never shows its chip.
- **ROI:** these are the things a user *sees* on a normal day. All four are S-effort one-to-few-line fixes with existing test scaffolding (`parser.test.ts`). Add the missing cases as regression tests.
- **Effort:** S total.

### 0.4 Slack `.slice(0,3)` before `.filter()` drops all human messages in bot-heavy channels
`slack.ts:168-171` takes the newest 3 messages *then* filters out bots. In a channel where CI/bots post frequently, the channel contributes zero messages even though real discussion exists in-window. "What's happening in #deploys?" → "nothing."
- **ROI:** one-line reorder (`.filter().slice()`), directly fixes wrong answers.
- **Effort:** XS.

### 0.5 Calendar timezone bugs put evening meetings on the wrong day
`google.ts:144-167` (and 3 duplicate copies) computes `date: startDate.toISOString().split("T")[0]` — the **UTC** date. A 6pm PDT meeting lands under *tomorrow*; all-day events (`start.date`) render at a bogus clock time. This feeds the agent's "Today's Calendar" prompt, so the model gives wrong schedule answers too.
- **ROI:** correctness bug in a headline feature; users lose trust fast when the schedule is wrong. Fix once in a shared mapper (see 2.3).
- **Effort:** S–M.

---

## Tier 1 — The reliability backbone (the biggest structural payoff)

This is the theme that showed up in every audit: **the data layer cannot tell "broken" from "empty," has no timeouts, and no shared error channel.** Fixing this one seam removes a whole class of silent-failure bugs.

### 1.1 Connectors have no request timeouts — one hung socket freezes the entire data plane
Every `fetch` in google/github/slack/linear/notion/posthog is issued with no `AbortSignal` (only MCP has timeouts). The manager gathers them under a single-flight `Promise.all` (`manager.ts:206-236`). On laptop sleep/wake or a captive portal, one black-holed connection means `doFetchAllData` never resolves, pinning the 60s poll, agent system-prompt assembly, and project inference **indefinitely** — dashboard never refreshes, no error shown.
- **Fix:** `AbortSignal.timeout(10_000)` per connector fetch (or a per-connector race in the manager).
- **ROI:** removes the single worst hang in the app; every other data feature depends on this resolving. **Effort:** S–M.

### 1.2 Errors are indistinguishable from "no data" — then cached and persisted over good data
Every connector ends `catch { return []; }` and `if (!res.ok) return []`. A GitHub 403 (secondary rate limit) returns `[]`, `_connected.github` stays `true`, the dashboard shows "no PRs," the agent asserts you have no open PRs — and the empty snapshot **overwrites the last-good offline cache** (`data/route.ts:24,30`), so the fallback is now empty too.
- **Fix:** connectors return `{ items, error? }`; `Promise.allSettled` in the manager; keep last-good on error; surface per-source error state in `_connected`/status; don't overwrite the offline cache with error-empty results.
- **ROI:** this is the most user-hostile quality issue in the app — silent OAuth death and rate-limits currently look identical to "you have nothing." Also unblocks a "reconnect" UX and honest status dots. **Effort:** M.

### 1.3 No 429 / rate-limit handling anywhere
No connector inspects 429, `Retry-After`, or Slack's `{ok:false, error:"ratelimited"}`; none retries. Per poll: GitHub 2 calls incl. the 30-req/min search API, Slack `conversations.list` + up to 8 Tier-3 `conversations.history` + a `users.info` per author, Gmail 1 list + **10 serial** metadata gets. Busy workspaces trip limits, connectors zero out, and the 60s poll keeps hammering.
- **Fix:** honor `Retry-After`/`ratelimited`, one bounded retry with jitter, parallelize Gmail metadata (Slack already does this — the two are inconsistent).
- **ROI:** stops the flicker-to-empty and the self-inflicted rate-limit spiral. **Effort:** M.

### 1.4 Timestamps are relative strings ("2h ago") used as identifiers — corrupts three subsystems at once
Connectors emit the same field three different ways: relative text (`github`, `slack`, `notion`), `toLocaleString()` (`linear`, `google`), and ISO (search paths). Downstream:
- **History dedup** keys off `"2h ago"` (`writer.ts:100-103`), ignoring the stable `id` Slack already provides (`slack.ts:197`) — so the same messages re-accumulate roughly hourly, all day, inflating the 5-item budget fed into every chat prompt with duplicates.
- **Search ranking** stores useless "5h ago" timestamps; intra-day recency is lost.
- **Project inference** needs a 40-line locale-dependent heuristic (`infer.ts:360-402`) to undo it; on a non-en-US locale everything parses to `NaN→0→"recent"`, so the 3-day window and sort order break.
- **Fix:** connectors emit ISO everywhere; format relative time in the UI only; dedup on `item.id`.
- **ROI:** one change (ISO at the connector edge) fixes history dedup, search quality, and inference recency together. **Effort:** M mechanical.

### 1.5 Spawn failure leaves an agent permanently "busy" and can crash the server
`agent-manager.ts:451-494`: `busy`/`activeRequests` are only decremented in `proc.on("close")`. If spawn fails (user runs `npm uninstall -g @anthropic-ai/claude-code`, or an nvm switch moves the binary mid-session), Node emits `error` but not `close` → the agent is stuck busy forever, and `proc.stdin.write()` on the failed spawn throws on a stream with **no error listener** → uncaught exception that can take down the Next server.
- **Fix:** decrement/unbusy in an `error` handler; `proc.stdin.on("error", noop)`; write stdin only after the `spawn` event.
- **ROI:** a missing/updated CLI is a *normal* user event; today it bricks the agent or the server. **Effort:** M.

### 1.6 Granola is fully wired but permanently empty (dead feature)
`manager.ts:260` hardcodes `granolaMeetings: []`; `fetchGranolaMeetings` has no callers in the poll path. Yet the system prompt, dashboard section, history writer, search, and project-inference meeting signals all reference it. A user who "connects Granola" sees connected status and never gets a single note.
- **Fix:** either call the connector (guarded by availability + platform) or point the granola surfaces at the MCP resources; otherwise delete the dead connector.
- **ROI:** either revives an advertised integration or removes ~200 lines of confusing dead code. **Effort:** S–M.

---

## Tier 2 — Architecture drag (slows every future feature)

The app works, but four copies of everything means each change is made — and diverges — four times.

### 2.1 The streaming chat client is copy-pasted 4× (~300 lines)
The `getReader()`/`TextDecoder`/append loop lives in `ChatColumn.tsx` (twice), `ContextualChatView.tsx`, and `DashboardView.tsx`; `readErrorBody`/`chatFailureMessage` are duplicated verbatim. They've **already diverged**: only `ChatColumn` handles the `X-Cockpit-Login-Needed`/fallback-agent headers; the others show generic errors for actionable 401s. None aborts on unmount, so a stream keeps writing into persisted state after you navigate away.
- **Fix:** one `streamChat({agentId, message, signal, onChunk})` in `src/lib/chat-client.ts` + a `useChatStream` hook; delete ~250 lines; add the AbortController once.
- **ROI:** every future chat improvement (retry, abort, login UX) becomes 1 edit instead of 4; kills the divergence bug class. **Effort:** M, pays off 4×.

### 2.2 `usePersistedState` doesn't sync across instances → chat silently misrouted to the wrong agent
`use-persisted-state.ts` hydrates from localStorage once and never subscribes to changes. `"cockpit-active-agent"` is read/written by four places, two of which bypass the hook with raw `localStorage.setItem` (`SettingsView.tsx:413`, `OnboardingView.tsx:161`). Switch agents in ChatColumn and every focus-chat/dashboard-chat message still goes to the **old** agent until reload, because `page.tsx` captured the mount-time value.
- **Fix:** module-level subscriber registry (or `storage` event) so same-key instances stay in sync; forbid raw writes of hook-owned keys. ~40 lines.
- **ROI:** fixes a live correctness bug (misrouted traffic) and inoculates every other shared persisted key. **Effort:** S.

### 2.3 Connector mapping code duplicated 4× per provider, with drift
`google.ts` (746 lines) repeats the calendar-event mapper 4× and the Gmail mapper 4×; `linear.ts` repeats its node mapper 2×. Copies have drifted — `searchEmails` emits ISO while `fetchRecentEmails` emits locale strings (the root of 1.4). Every field addition needs 4 edits.
- **Fix:** module-level `mapGoogleEvent`/`mapGmailMessage`/`mapLinearIssue`; standardize on ISO. This is also where 0.5 and 1.4 land.
- **ROI:** shrinks the largest connector ~40% and makes the timezone/timestamp fixes single-site. **Effort:** S.

### 2.4 Shared API types are hand-redeclared per component; zero runtime validation
`AgentInfo`, `BackendDef`, `DatasourceInfo`, `BackendStatus` are each redeclared 2–3× across components; `BACKEND_ICONS` exists 3× with *different glyphs*. Responses are typed by assertion only — `await req.json()` destructured raw in most routes; `zod` isn't in the tree at all. 61 `any` in production code (~45 of them unvalidated external-API JSON). Provider drift (e.g. Composio result shapes guessed with `result.items ?? result.events`) fails silently to empty UI. The `GET /api/agents` route even leaks each agent's full `systemPrompt` (`agent-manager.ts:283`) and the type system can't see it because no client type includes the field.
- **Fix:** `src/lib/api-types.ts` imported by both sides; add zod, parse at the connector fetch edge and on mutating route bodies (start with the 5 connectors + agents/MCP/skills routes).
- **ROI:** makes provider drift a compile/parse error instead of a blank panel; makes the systemPrompt leak visible. **Effort:** L, but incremental (connector by connector).

### 2.5 The four 1,000+ line components
`SettingsView.tsx` (1795 — eight sections + four sub-forms + 25 `useState` in one file, toggle markup copy-pasted 3× and already diverged in error handling), `ChatColumn.tsx` (1261), `OnboardingView.tsx` (1084 — re-implements Settings' connect/PostHog/default-engine flows with *different* timeouts), `ContextColumn.tsx` (831 — todos never resync from server, index keys + drag-reorder can toggle the wrong todo).
- **Fix:** decompose into section components + shared hooks (`useAgents`, `useDatasources`, `useChatStream` from 2.1) + ~6 shared primitives (`Toggle`, `Card`, `Panel`, `TextField`). Do it *after* 2.1–2.4 land (they provide the hooks), and add component smoke tests first (see 3.2) so the refactor has a net.
- **ROI:** these four files are the top of the churn chart; every settings/onboarding/chat change pays the tax today. **Effort:** L (~1 week total), amortizable.

---

## Tier 3 — Performance (felt, but after correctness)

### 3.1 Chat input state lives at the app root → whole-app re-render on every keystroke
`page.tsx:88` holds `chatInput`; only `ChatColumn`/`ChatMessage` are memoized. Each keystroke re-renders Header, ProjectsColumn, FeedColumn, and ContextColumn — whose `CalendarAgenda` rebuilds a group Map and re-sorts every render. **Fix:** move input into `ChatColumn` (replace the prefill lift with a prop/ref); memo the three columns. **Effort:** S–M. Most-felt perf issue.

### 3.2 `--version` spawned before every single chat message
`chat/route.ts:28` calls `detectProvider` (a full `claude --version` Node startup, 5s timeout) on every message → **+0.3–1.5s to time-to-first-token every time**; the fallback scan repeats it per candidate. **Fix:** cache detection 30–60s. **Effort:** XS. Biggest latency win for the money.

### 3.3 History search is synchronous over all history files, on every message
`search.ts:188-254`: `readdirSync` + per-file `readFileSync`+`JSON.parse` across up to ~63 files, **blocking the single Next event loop** at the latency-critical start of every chat turn, growing unbounded (no retention; +1.4's duplicate inflation makes it worse). **Fix:** mtime-cache parsed day-files (the `fs-cache.ts` pattern already exists); add a 90-day retention sweep. **Effort:** S–M.

### 3.4 Gmail = 11 serial round-trips per poll
`fetchRecentEmails` awaits each message's metadata one at a time (~1.5–3s serial), and it's the long pole of the whole 60s poll since the manager awaits `Promise.all`. Slack already parallelizes the identical pattern. **Fix:** `Promise.all` the metadata gets. **Effort:** XS. (Same edit as 1.3's parallelization.)

### 3.5 One idle warm CLI process per used agent, never reaped
After each message, `warmAgent` respawns a warm process (~150–300MB RSS each). Five chatted-with agents ≈ 0.75–1.5GB idle RSS held indefinitely; nothing kills warm procs on shutdown either (orphans across dev restarts). Also the warm proc bakes in a **stale** system prompt — idle overnight, the morning's first answer uses yesterday's "Today's Calendar." **Fix:** idle-TTL warm procs (re-warm on tab focus) or warm only the active agent; kill on SIGTERM; move volatile context to the per-message prelude that already exists. **Effort:** M.

### 3.6 Cheaper wins
Fold PostHog/MCP into the main parallel batch instead of awaiting them after it (`manager.ts:238-244`, XS); hash the 60s IPC payload and skip identical pushes to avoid a full-tree re-render per idle minute (S); throttle streaming chunk-to-state flushes to end the O(n²) re-parse of long responses (`ChatMessage.tsx:193`, S); startup UI is blocked on provider detection — render the shell immediately (S).

---

## Tier 4 — Testing / CI / release hardening

### 4.1 Highest-blast-radius code is untested
~28% of `src/lib` modules have any test. **Zero** tests on: `actions/executor.ts` (sends Slack messages / creates Linear issues on approval — only its schema is tested), `datasources/manager.ts`, `token-store.ts`, `projects/infer.ts`, the google connector, `memory/store.ts`, and all 30 API routes. These are exactly the modules where a regression is invisible until a user's integration silently breaks. **Fix:** start with executor (mock connectors), manager + token-store, infer output-parsing (fixture CLI output), then route handlers. **Effort:** ~3 days for the top tier; also the safety net the Tier-2 refactors need. Add `vitest --coverage` with a modest `src/lib` threshold (XS).

### 4.2 Lint is completely broken
`package.json` `"lint": "next lint"` is deprecated, and **ESLint isn't installed** (`grep -c eslint pnpm-lock.yaml` → 0). `AGENTS.md` openly documents it as an unreliable gate. So the entire hook-dependency / unused-var / unsafe-pattern bug class has no detector — and several such bugs are already in the tree (mount-only effects with missing deps, index keys). **Fix:** install `eslint` + `eslint-config-next` + `eslint-plugin-react-hooks`, run the Next codemod, wire `eslint .` into CI, include `electron/*.js`. **Effort:** S.

### 4.3 The most privileged file has zero automated checks
`electron/main.js` (988 lines — updater, tray, window lifecycle, deep-link handling) is plain JS excluded from `tsconfig` includes, not linted, not tested. A typo ships and manifests as a packaged-app crash that CI's server-only smoke won't catch. **Fix:** `checkJs: true` + include `electron/**/*.js`; lint it; extract pure helpers (update-gate, deep-link param filter) into testable modules. **Effort:** M.

### 4.4 The OAuth proxy every released binary depends on has no checks
Root `tsconfig` **excludes** `proxy/`; `proxy/package.json` has no scripts, no TypeScript, no tests, no CI — 172 lines of security-critical token-exchange code compiled/tested nowhere, deployed by manual `vercel --prod`. Also `proxy/vercel.json` still injects `Access-Control-Allow-Origin: *` at the platform layer, contradicting the code-level CORS fix (AUDIT H6 only half-closed). **Fix:** `proxy/tsconfig.json` + `typecheck` in CI; a vitest suite for the handler (auth fail-closed, service allowlist, grant_type); delete the `vercel.json` headers block. **Effort:** S–M.

### 4.5 Release-pipeline sharp edges
Landing CTA `landing/index.html:567` is version-pinned (`Cockpit-0.1.0-arm64.dmg`) so the first 0.2.0 release 404s the main download button (S — upload a stable-named alias asset). No tag↔`package.json` version consistency check in `upload-github.js` (XS — dispatching a mismatched tag ships wrong `latest-mac.yml`). Release is created live and clobbered in place rather than draft→publish, so `releases/latest` can be hit mid-upload (S). ~90-checkbox `MANUAL_TEST_PLAN.md` per release, which realistically converges to "no QA" — automate the top ~20 with Playwright against `next dev` (L, but cuts per-release manual time to <30 min).

### 4.6 Dependencies
`pnpm audit --prod` reports 23 advisories (10 high) — but they're concentrated in `proxy > @vercel/node` and dev tooling (esbuild, tar, undici, path-to-regexp), not the shipped Electron app; treat as hygiene, bump `proxy` deps and dev toolchain. All runtime deps except `electron-updater` currently sit in `devDependencies` (works only because Next bundles them). `tsconfig` `target: ES2017` is needlessly old for Electron 41 / Node 22 (XS).

---

## Security (mostly closed — for completeness)

The prior `AUDIT.md` is in good shape: verified fixed — ASAR on, `sandbox:true`, per-session API-token gate + `Sec-Fetch-Site` CSRF in middleware, deep-link param allowlist, `execFile` (no shell) everywhere, proxy fail-closed, token refresh race guards, `0o600` credential files. Remaining items are defense-in-depth:
- **No Content-Security-Policy** in the renderer (`next.config.ts` has no `headers()`) — the one still-open prior HIGH. The chat surface renders LLM output influenced by attacker-controlled external data (emails, Slack, Notion), so CSP is the backstop if any render path regresses. **Fix:** add a CSP header. **Effort:** S. *Ship before launch.*
- **Memory is a persistent, cross-agent prompt-injection vector** with a weak keyword scanner (`memory/store.ts:24-34`) that has heavy false positives and trivial bypasses ("disregard everything above" passes). Injected instructions phrased to dodge the regex persist to `~/.cockpit` and inject into *every future session and agent*. **Fix:** treat memory writes as untrusted (confirm in UI / require explicit user intent), fence memory as data-not-instructions in the prompt, drop the keyword scanner in favor of read-side sandboxing. **Effort:** M. Highest-leverage injection surface.
- **LLM-proposed actions** are gated only by a UI Execute click; `/api/actions/execute` hard-sets `confirm:false` server-side. A malicious email could induce a `gmail_send`/`slack_send_message` proposal to an attacker destination that looks benign in the card. **Fix:** per-action nonce issued when the card renders; a distinct high-risk confirm for exfiltration-prone actions showing full recipients. **Effort:** M.
- **Gmail draft builds raw headers from LLM params** (`google.ts:702-708`) with only non-empty validation → CRLF header injection (silent `Bcc:`) and unencoded non-ASCII subjects. **Fix:** per-field validators, strip CR/LF, RFC-2047 encode. **Effort:** M.
- Quick hardening: validate/encode Notion `pageId` in the API path (XS); allowlist PostHog `apiHost` to block SSRF to internal IPs (S); explicit Host-header allowlist in middleware (S).

Also in the memory/data layer: the `§` delimiter isn't escaped so entries containing it fragment permanently on reload (`store.ts:15`, S); `replace`/`remove` use case-insensitive **substring** matching so `remove "the"` deletes the first entry containing "the" (`store.ts:149`, S–M); memory silently stops persisting at its tiny bound with the failure only logged to a closed stream's console (`agent-stream.ts:136`, M) — together these make the memory feature quietly lie to users.

---

## Recommended sequence

1. **Week 1 (Tier 0):** fix the red test + branch protection (0.1); unbreak mac auto-update (0.2); the four parser bugs (0.3); Slack slice/filter (0.4); calendar timezone (0.5). Add CSP (security). *All small, all high-visibility.*
2. **Weeks 2–3 (Tier 1):** connector timeouts + `{items,error}` + last-good caching (1.1, 1.2), 429 handling (1.3), ISO timestamps everywhere (1.4, resolves three subsystems), spawn-failure repair (1.5), Granola decision (1.6). *This is the reliability backbone — most of the silent-failure bug class dies here.*
3. **Weeks 3–4 (Tier 2 + tests):** ESLint (4.2) and executor/manager/infer tests (4.1) first, then the shared `streamChat` client (2.1), persisted-state sync (2.2), connector mappers (2.3), shared API types + zod at edges (2.4). *Now the big-component decomposition (2.5) has hooks and a net.*
4. **Ongoing (Tier 3 + release):** detection cache (3.2) and Gmail parallelization (3.4) are XS latency wins to grab immediately; keystroke re-render (3.1), history-search cache (3.3), warm-proc TTL (3.5) as capacity allows; proxy CI (4.4), landing link + release-draft fixes (4.5).

The cheapest ~2 days of work (Tier 0 + 3.2/3.4/4.2) removes the most user-visible breakage and restores CI as a real gate. The ~2 weeks of Tier 1 is where the durable reliability gain lives.
