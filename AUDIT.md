# Cockpit Pre-Launch Audit

Full codebase audit conducted by Claude Opus 4.6 across 5 parallel agents reviewing: Electron main process, API routes, React components, lib/utilities, and build/config/tests — plus a dedicated UX design review.

---

## Part 1: Security & Code Quality Audit

### Severity Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 11 |
| MEDIUM | 20 |
| LOW | 27 |

---

### CRITICAL (5)

#### C1. ASAR disabled — app source readable on disk
**`package.json:49`**
`"asar": false` means all source files (including baked-in proxy secret) are shipped as plaintext in `Cockpit.app/Contents/Resources/app/`. Any local process can read or modify them — including injecting code into `main.js` that runs with full Node.js privileges on next launch.
**Fix:** Set `"asar": true`. Use `asarUnpack` only for files that need it.

#### C2. MCP PATCH route allows arbitrary command injection
**`src/app/api/datasources/mcp/[id]/route.ts:31-34`**
PATCH accepts any JSON body and passes it to `updateMcpServer()` with zero validation. An attacker (or a prompt-injection through chat) can overwrite `command` to any executable and `args` to anything. The POST route validates; PATCH does not.
**Fix:** Apply the same validation from POST to PATCH. Extract into a shared validator.

#### C3. `curl | bash` remote code execution in install-claude route
**`src/app/api/install-claude/route.ts:19`**
Pipes `https://claude.ai/install.sh` directly into bash via `exec()`. DNS/TLS compromise = arbitrary code execution with the user's full permissions.
**Fix:** Download to temp file, verify hash, then execute. Or use `npm install -g @anthropic-ai/claude-code`.

#### C4. Token refresh race condition — double-refresh can invalidate tokens
**`src/lib/datasources/connectors/google.ts:98-112`**, **`linear.ts:88-101`**
No concurrency guard on token refresh. Two concurrent callers (data poll + search + background tick) can all hit the refresh window simultaneously. Many OAuth providers invalidate the old refresh token upon use, so the second call fails and the user gets silently disconnected.
**Fix:** Add an in-flight promise guard per service:
```typescript
let _refreshInFlight: Promise<TokenSet> | null = null;
// if (_refreshInFlight) return _refreshInFlight;
// _refreshInFlight = doRefresh().finally(() => { _refreshInFlight = null; });
```

#### C5. `.env.local` contains live secrets in worktree
**`.env.local`**
Contains `OAUTH_PROXY_SECRET`, `COMPOSIO_API_KEY`, and Composio auth configs. Even though `.gitignore` lists it, verify it was never committed with `git log --all -- .env.local`. The proxy secret is baked into builds via `next.config.ts`.
**Fix:** Rotate all four secrets. Verify git history is clean.

---

### HIGH (11)

#### H1. Unauthenticated API routes — any local process can call them
**All routes under `src/app/api/`**
No auth beyond localhost + CSRF middleware. Any process on the machine can call `/api/actions/execute` to send Slack messages, create Linear issues, create calendar events using stored tokens.
**Fix:** Generate a per-session secret in Electron, pass to renderer, require on all API requests.

#### H2. Deep link forwards arbitrary query strings to localhost
**`electron/main.js:642-653`**
`parsed.search` from `cockpit://` URLs is forwarded raw to the callback endpoint. Attacker-crafted deep links can inject arbitrary query parameters.
**Fix:** Parse and allowlist specific query parameters (`code`, `state` only).

#### H3. `askClaude` in `projects/infer.ts` leaks full process.env
**`src/lib/projects/infer.ts:209-213`**
`cleanEnv()` only removes `CLAUDECODE`. All other env vars (secrets, API keys, database URLs) are passed to the spawned Claude CLI process.
**Fix:** Replace `cleanEnv()` with `buildAgentEnv()`.

#### H4. `authenticate-claude` route spawns without sanitized env
**`src/app/api/authenticate-claude/route.ts:4-26`**
Uses unsanitized `process.env` instead of `buildAgentEnv()`, inconsistent with other spawn sites.
**Fix:** Use `buildAgentEnv()`.

#### H5. Proxy secret bypass when PROXY_SECRET is unset
**`proxy/api/oauth/token.ts:74-79`**
If the env var is missing, all requests are accepted without authentication. Fails open.
**Fix:** Fail closed: `if (!proxySecret) return res.status(500).json({ error: "Proxy not configured" });`

#### H6. Proxy CORS is `Access-Control-Allow-Origin: *`
**`proxy/api/oauth/token.ts:66`**
Any website can call the token exchange proxy combined with the baked-in proxy secret.
**Fix:** Restrict to `http://localhost:*` or remove CORS entirely (proxy is called server-side).

#### H7. No Content-Security-Policy headers
**`next.config.ts`**
No CSP configured. AI-generated content could include executable scripts inside Electron.
**Fix:** Add CSP headers: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`.

#### H8. No `sandbox: true` on Electron BrowserWindow
**`electron/main.js:443-447`**
Has `nodeIntegration: false` and `contextIsolation: true` (good) but missing OS-level renderer sandbox.
**Fix:** Add `sandbox: true` to `webPreferences`.

#### H9. Open redirect in Composio callback
**`src/app/api/datasources/callback/route.ts:105`**
Redirects to URL from Composio API (`link.redirectUrl`) without domain validation.
**Fix:** Validate redirect URL starts with expected Composio domain before redirecting.

#### H10. Unsanitized URL href in ActionCard (XSS in Electron)
**`src/components/ui/ActionCard.tsx:143`**
`result.url` from API response rendered as `<a href={...}>` without `safeHref()`. A `javascript:` URL would execute inside Electron.
**Fix:** Apply `safeHref()` from ChatMessage.tsx.

#### H11. `dialog.showMessageBoxSync(mainWindow)` crashes if mainWindow is null
**`electron/main.js:120`**
Auto-update dialog fires 5s after app ready — can race with window creation.
**Fix:** Guard with `mainWindow && !mainWindow.isDestroyed() ? mainWindow : null`.

---

### MEDIUM (20)

| # | Issue | File | Fix |
|---|-------|------|-----|
| M1 | `render-process-gone` handler doesn't check `isDestroyed()` | `main.js:514` | Add guard |
| M2 | `localhost` vs `127.0.0.1` mismatch between server bind and URL construction | `main.js` multiple | Use `127.0.0.1` everywhere |
| M3 | Preload IPC listeners accumulate on re-mount | `preload.js:6-11` | Return unsubscribe function |
| M4 | Duplicate polling intervals in SettingsView (3s + 2s) | `SettingsView.tsx:152+204` | Remove second polling effect |
| M5 | Double-fire on Enter+blur in ProjectsColumn create form | `ProjectsColumn.tsx:371` | Blur on Enter, let onBlur handle |
| M6 | Double-fire on Enter+blur in ChatColumn agent rename | `ChatColumn.tsx:581` | Same pattern |
| M7 | Double-fire in SettingsView EditableField and agent rename | `SettingsView.tsx:1491` | Same pattern |
| M8 | No AbortController for streaming fetches — leaks on unmount | `ChatColumn.tsx:218` | Add AbortController |
| M9 | Todos state never syncs when context.todos changes | `ContextColumn.tsx:123` | Add useEffect to merge |
| M10 | Feed items use array index as React key | `FeedColumn.tsx:169` | Generate stable keys |
| M11 | Stale closure risk in loadAgentsAndBackends callback | `ChatColumn.tsx:113-137` | Fix dependency array |
| M12 | Missing `setMessages` in sendMessage dependency array | `ContextualChatView.tsx:166` | Add to deps |
| M13 | Gmail fetches are sequential N+1 API calls | `google.ts:280-325` | Use Promise.all with concurrency |
| M14 | All-day calendar events produce NaN duration | `google.ts:137-143` | Guard for date-only events |
| M15 | Slack userNameCache is unbounded, never cleared | `slack.ts:81` | Add LRU/TTL eviction |
| M16 | MCP client cache never evicts stale/disconnected clients | `mcp.ts:37` | Health check + evict on remove |
| M17 | File system token store has write race condition (TOCTOU) | `token-store.ts:20-30` | Add file locking or serialize writes |
| M18 | `process.on("exit")` calls async `client.close()` — never runs | `mcp.ts:185` | Use `beforeExit` for async cleanup |
| M19 | History `mergeById` keeps stale items, discards updated ones | `writer.ts:52-79` | Prefer incoming item |
| M20 | Agent `systemPrompt` leaked in GET responses (contains PII, business data) | `agents/route.ts` | Strip from response |

---

### LOW (27)

**Accessibility (4):**
- Delete agent button uses `<span>` not `<button>` — not keyboard accessible (`ChatColumn.tsx:626`)
- Todo checkbox is a `<div>` without ARIA attributes (`ContextColumn.tsx:329`)
- Notification bell auto-marks-all-read on open before user can scan (`NotificationBell.tsx:73`)
- Textarea doesn't auto-resize on external prefill (`ChatColumn.tsx:922`)

**TypeScript (3):**
- `any[]` for inferredProjects hides type mismatches (`page.tsx:53`)
- `any` in RenderBlockRenderer onItemClick prop (`RenderBlockRenderer.tsx:15`)
- Unsafe `(window as any).electronAPI` with no type declarations (`page.tsx:88`)

**CSS (2):**
- Hex-alpha string building in NotificationBell produces wrong opacity (`NotificationBell.tsx:209`)
- No light theme or `prefers-color-scheme` support (`globals.css`)

**Performance (2):**
- `context.calendar.indexOf(m)` is O(n^2) in render loop (`ContextColumn.tsx:196`)
- Large inline style objects created on every render across all components

**Electron (5):**
- SIGKILL timeout not cleared when process exits cleanly (`main.js:343`)
- Tray icon is white-only — invisible on light system trays on Windows/Linux (`main.js:163`)
- `window-all-closed` is empty — traps Linux users with no tray support (`main.js:793`)
- Auto-update setInterval never cleared on quit (`main.js:139`)
- `fetchJson` doesn't check HTTP status code (`main.js:687`)

**Platform (2):**
- Granola connector hardcodes macOS path (`granola.ts:6`)
- Crash log file permissions ignored on Windows (`main.js:16`)

**Data (4):**
- Inconsistent date formats: `toLocaleString()` vs `toISOString()` in same data types (`google.ts`)
- GitHub notification URL points to API URL, not browser URL (`github.ts:180`)
- `parseRelativeTime` doesn't handle ISO timestamps — returns Infinity (`context-client.ts:16`)
- `usePersistedState` shows default value flash before localStorage hydration (`use-persisted-state.ts:15`)

**Config (3):**
- PostHog API key hardcoded in source (`analytics.ts:3`)
- `opt_out_capturing_by_default: false` contradicts opt-in design (`analytics.ts:44`)
- `posthog-js` listed in devDependencies but used in production code (`package.json:35`)

**Other (2):**
- Landing page download links to hardcoded version — breaks on new releases (`landing/index.html:494`)
- `tsconfig.json` target ES2017 is conservative for Electron 41 + Node 22 (`tsconfig.json:3`)

---

### What's Done Well

- **Electron security basics:** `nodeIntegration: false`, `contextIsolation: true`, preload with allowlisted IPC channels, navigation restriction via `will-navigate` and `setWindowOpenHandler`
- **CSRF middleware:** Solid `Sec-Fetch-Site` based protection for API routes
- **Token storage:** Files written with `0o600` permissions in `~/.cockpit/`
- **Agent env allowlist:** Explicit allowlist in `buildAgentEnv()` prevents leaking secrets to spawned processes
- **OAuth state CSRF protection:** Cryptographic state parameter with 10-minute expiry
- **Path traversal hardening:** Custom skills validate IDs against traversal attacks (tested)
- **Deep link handling:** Single-instance lock, URL parsing with try/catch
- **Crash logging:** Bounded to 50 entries, fails silently
- **HTML escaping:** OAuth callback properly escapes user-facing content
- **Test coverage:** 10 test files covering middleware CSRF, agent env allowlist, event server auth, conversation persistence, parser, provider registry, skills path traversal, claude hooks, agent-manager purity, and fs-cache

---

## Part 2: UX Design Review

### Top 5 UX Issues

#### UX1. Onboarding flow is broken — users who skip Claude never see datasources
**`page.tsx:361`**
When a user clicks "Skip" on the Claude setup screen, `onRetry` fires, setting `onboardingDismissed = true`. They jump straight to the main app and never see the datasource connection step (step 2). This directly kills first-run conversion.
**Fix:** Route both Skip and Continue through the full two-step flow. Only dismiss onboarding after step 2 is completed or explicitly skipped.

#### UX2. `alert()` is used everywhere for errors
Native browser `alert()` dialogs appear in 10+ places across ProjectsColumn, ChatColumn, and SettingsView. They block the entire Electron process, look broken against the dark terminal aesthetic, and can't be styled.
**Fix:** Replace all `alert()` calls with an in-app toast/notification component.

#### UX3. 24px root font size makes everything too large
**`globals.css:32`**
At 24px root, body text (0.75rem) renders at 18px. On a 1440px laptop, this wastes valuable screen real estate in a data-dense 3-column layout. The type scale is also flat — h1 (0.85rem = 20.4px) barely differs from body (0.75rem = 18px).
**Fix:** Reduce root to 16-18px. Create a more distinct type scale with at least 30-40% difference between headings and body.

#### UX4. Keyboard shortcuts are undiscoverable
The app has Cmd+K, Cmd+,, Cmd+., Shift+Enter, Tab completion — but no help overlay, no shortcut reference, no "?" screen. For a terminal-aesthetic app targeting power users, this is a significant gap.
**Fix:** Add Cmd+/ or ? to show a shortcut reference overlay. At minimum, list shortcuts in Settings.

#### UX5. Landing page says "free" but doesn't mention Claude subscription
The page says "Free, local & open source" but the Claude subscription requirement is a surprise in onboarding. Users will feel deceived.
**Fix:** Add "Requires a Claude subscription (free tier works)" near the download button.

---

### What's Good

**First-run:**
- Two-step onboarding (Claude then Datasources) is the right sequence
- Auto-detection polling every 5s means the screen advances on its own after install — great frictionless touch
- Privacy reassurance ("All data stays on your machine") is placed exactly where trust concerns arise
- Skip is always visible — no trapped feeling

**Information architecture:**
- 3-column layout (Projects+Feed | Chat | Context) maps to a founder's mental model
- Right column toggleable via Cmd+.
- Collapsible panels manage density well
- Feed filter chips narrow down activity by source type

**Chat:**
- Multi-agent tab system is genuinely innovative for a founder tool
- Slash command autocomplete with Tab-to-complete feels native to the terminal aesthetic
- Image paste/drop support is practical
- `safeHref()` properly sanitizes links — good security awareness
- Message persistence with image stripping to avoid blowing localStorage quota shows careful engineering

**Navigation:**
- ESC universally closes overlays and goes back — consistent and discoverable
- Cmd+K, Cmd+, follow macOS conventions
- Header always shows connection status with a clear traffic-light dot

**Empty states:**
- Projects differentiates "no datasources" vs "connected but no projects detected" with actionable CTAs
- Chat shows role-specific starter prompts — great for first interaction
- Feed empty state has a clear "Connect datasources" button

**Error handling:**
- ErrorBoundary provides a clean full-screen fallback with Reload and Dismiss
- Offline indicator in header shows cached data timestamp — transparent, builds trust
- Settings failures show a red banner with Retry

**Settings:**
- Well-organized into clear sections with Advanced collapsed by default
- Analytics toggle is transparent about what is/isn't collected
- MCP server management is feature-complete
- Connected tools in a 2-column grid makes efficient use of space

**Visual design:**
- CSS variable system is clean — 20 vars cover the entire palette
- `color-mix()` for subtle backgrounds is modern and elegant
- Monospace font stack fits the aesthetic perfectly
- Panel system creates consistent visual rhythm
- Scrollbar styling matches the dark theme
- Shimmer animation for loading states is a nice touch

**Landing page:**
- "Pilot your company from one screen" is clear and compelling
- Four feature cards are well-chosen
- Privacy box addresses the #1 trust concern
- How-it-works numbered steps reduce perceived complexity

---

### What's Bad

**First-run:**
- `onboardingDismissed` is in-memory only — users see onboarding again every restart if Claude disconnects
- "Install Claude" button silently fails with zero user feedback on error
- Datasource polling at 3s indefinitely with no backoff

**Chat:**
- Streaming indicator is inconsistent between ChatColumn (green dot) and ContextualChatView (cursor blink)
- Error messages are generic ("Something went wrong") with no actionable instructions
- ActionCard cancel button is a no-op (`onCancel={() => {}}`)
- No way to clear chat history — silently trims old messages at 200
- Agent tab overflow has no scroll indicator — tabs disappear off-screen

**Navigation:**
- No keyboard shortcut to focus the chat input (should be Cmd+L or Cmd+J)
- Settings back button is a tiny arrow character — easy to miss compared to ContextualChatView's labeled "ESC" button
- No breadcrumb or location indicator in the header when in Settings or focused chat
- Double-click-to-rename on agent tabs is completely undiscoverable — only shown as a hover tooltip

**Settings:**
- No search or section jump navigation for a long scrollable page
- Profile section doesn't explain that filling it in personalizes AI responses
- No confirmation before disconnecting a service (immediate, irreversible)
- "Scope Upgrade" / "Reconnect to enable write actions" assumes users know what OAuth scopes are

**Layout:**
- Left column stacks Projects and Feed with no visual separation between them
- Right column mixes 6 unrelated panel types — heavy scrolling required
- At 280px left + 300px right, center chat gets only ~340px on a 1440px screen — too narrow for tables, charts, and code blocks
- Columns are not resizable

**Notifications:**
- Not actionable — can't click a notification to navigate to the relevant item
- No native OS notification integration for urgent items
- Auto-marks-all-read on dropdown open, making the explicit "Mark all read" button redundant

**Landing page:**
- Download links to a specific GitHub release version — breaks on any new release
- Only Apple Silicon offered — no Intel, Windows, or Linux, and no "coming soon" messaging
- Integration icons loaded from external CDNs — fragile
- No social proof whatsoever — no user count, testimonials, demo video, or "who built this"

---

### What's Unclear

**For new users:**
- No explanation of what "Claude" actually is on the onboarding screen — is it a subscription? A separate app? "No API keys needed" vs "uses your Claude subscription" contradicts
- Onboarding screenshot has no caption or annotation — missed opportunity to show value
- "Suggested subagent" is jargon non-technical founders won't understand
- FEATURED_SKILLS labels don't match slash commands — "Admin" maps to `/eng`, "Finance" maps to `/build`
- Todos empty state says "ask your AI to create some" but there's no way to do this
- Slack "No recent highlights" doesn't explain what qualifies as a highlight

**Onboarding-to-value pipeline:**
- **5-8 minutes** from download to first useful interaction
- Critical path: Download DMG, xattr in Terminal, Open app, Install Claude CLI, OAuth flow in browser, First question
- The xattr step is the biggest drop-off risk — non-technical founders will see "open Terminal" and leave
- **Recommendation:** Offer a demo mode with sample data so users can evaluate the UI before committing to installs and OAuth flows. Even a 30-second preview with dummy calendar events and Slack messages would dramatically reduce the "is this worth it?" evaluation time.

**Layout confusion:**
- ContextualChatView uses a different visual language (terminal-style with `>` prompts) than main ChatColumn (speech bubbles) — users won't know if they're talking to the same AI
- The Cmd+. shortcut to toggle the right column is non-standard — Cmd+. is typically "Cancel" in macOS; consider Cmd+\
- Tab key in chat inserts a literal tab character when no slash matches exist — breaks keyboard navigation for no benefit
