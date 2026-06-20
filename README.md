# Cockpit

Command center for your company. Desktop AI co-pilot that connects to your live tools and lets you ask questions, get context, and take action — all from one place.

## What's live

### AI Engine Layer
- **Claude-first, multi-backend** — Claude is the primary engine; Codex and Ollama available as alternates in the model switcher
- **Backend auto-detection** — scans installed binaries and versions at startup
- **Multi-agent system** — instant agent creation ("+" tab), double-click to rename, per-agent backend/model switching
- **One chat engine** — main chat and focus-view chat share the same agents, memory, and history
- **Warm process pre-spawning** — per-agent warm CLI processes for instant first tokens; system prompts rebuilt on every respawn with fresh datasource context
- **Conversation memory** — recent turns and relevant workspace history travel with each message (one-shot CLI calls, stateful conversations)
- **Streaming response parsing** — handles incomplete JSON blocks mid-stream without breaking
- **Skills system** — 12 built-in skills with slash commands, per-skill prompt injection, and enable/disable toggles; LLM can propose new custom skills mid-chat
- **Subagent spawning** — LLM suggests specialized subagents; user approves via inline button, subagent opens as a new tab

### Data Integrations (7 connectors + MCP)
- **Google Calendar** — next 7 days of events, auto token refresh with 5-min expiry buffer
- **Gmail** — recent emails with unread status
- **Linear** — assigned issues (excl. canceled/completed), priority mapping via GraphQL
- **GitHub** — open PRs involving user, notifications
- **Notion** — recent pages by last edit, OAuth + internal token fallback
- **Slack** — recent channel messages (past 24h), parallel fetch with username caching
- **Granola** — meeting notes from local macOS cache (last 7 days), mtime-cached parsing
- **Generic MCP client** — connect any MCP server (stdio or SSE) as a datasource; resources auto-injected into AI context

### Context & Intelligence
- **Dynamic system prompt builder** — user profile + live calendar, Slack, Linear, GitHub, email, Notion, Granola, and MCP data assembled per spawn
- **Knowledge layer** — datasource history persisted daily to `~/.cockpit/history/`; keyword search over past items injected as historical context with each message
- **Memory** — two bounded markdown files (MEMORY.md + USER.md); LLM-driven add/replace/remove via `cockpit_memory` blocks, injection-pattern scanning, live entries in every prompt
- **Render blocks** — tables, bar charts, card grids, layouts, and mermaid blocks embedded inline in responses via `cockpit_render` JSON
- **Context Focus** — click any calendar event, feed item, metric, or search result to open an entity-focused chat with structured data and suggested questions
- **Project inference** — projects auto-clustered from Linear/GitHub/Slack signals via LLM, with heuristic fallback; clustering cached on disk and re-run only when sources change

### Dashboard & UI
- **Live activity feed** — color-coded by type, built from all connected sources
- **Context sidebar panels** — calendar (grouped by day), Slack highlights, skills, todos
- **Chat interface** — terminal-style input, markdown rendering, image attachments (paste/drop), slash-command autocomplete
- **Live refresh** — Electron main process polls every 60s and pushes to the renderer over IPC (browser dev mode falls back to polling)

### Auth & Token Management
- **OAuth via token-exchange proxy** — client secrets never ship in the app or repo; they live in a small Vercel function (`proxy/`)
- **Auto token refresh** — 5-minute buffer before expiry, transparent to caller
- **Secure local storage** — tokens in `~/.cockpit/` with `0o600` permissions, mtime-cached reads
- **Deep-link OAuth callback** — `cockpit://` protocol forwards to the local server

### Settings & Onboarding
- **2-step onboarding** — Claude install/sign-in (auto-detecting, with one-click install) → connect one tool, add the rest later
- **Settings** — profile, connected tools, AI engines, analytics opt-in; MCP servers, skill toggles, custom skills, and agent management under Advanced
- **Persisted state** — debounced localStorage writes, capped per-agent chat history, images excluded from persistence

### Search
- **Command palette** (Cmd+K) — instant client-side search across cached data, then live API search with LIVE badge
- **Live search providers** — Gmail, Google Calendar, Linear, GitHub, Notion, Slack
- **Source filtering** — `in:slack`, `in:linear`, `in:github`, etc.

### Write-Back Actions
- **Action cards** — LLM proposes actions via `cockpit_action` JSON; user reviews and approves inline
- **6 action types** — `linear_create_issue`, `github_comment_pr`, `slack_send_message`, `calendar_create_event`, `gmail_draft`, `notion_update_page`
- **Action log** — executed actions persisted to `~/.cockpit/action-log.json` (capped at 500)

### Analytics & Crash Reporting
- **PostHog integration** — opt-in anonymous usage analytics (off by default); no personal data or chat content sent
- **React error boundary + global error listeners**; Electron process-level handlers log to `~/.cockpit/crash-log.json`
- **Renderer crash recovery** — auto-reload on `render-process-gone` / `unresponsive`

### Search
- **Command palette** (Cmd+K) — instant client-side search across cached data, then live API search with LIVE badge
- **Live search providers** — Gmail, Google Calendar, Linear, GitHub, Notion, Slack (via `search.messages`)
- **Source filtering** — `in:slack`, `in:linear`, `in:github`, etc.
- **Grouped results** — by source with color-coded badges, keyboard navigation, shift+Enter to open URL

### Write-Back Actions
- **Action cards** — LLM proposes actions via `cockpit_action` JSON, user reviews and approves inline
- **6 action types** — `linear_create_issue`, `github_comment_pr`, `slack_send_message`, `calendar_create_event`, `gmail_draft`, `notion_update_page`
- **Action log** — all executed actions persisted to `~/.cockpit/action-log.json`

### Memory
- **Hermes-style memory** — two bounded markdown files (MEMORY.md + USER.md) in `~/.cockpit/memories/`
- **Frozen snapshot** — loaded at session start, injected into system prompt
- **LLM-driven writes** — model outputs `cockpit_memory` JSON blocks to add/replace/remove entries
- **Content scanning** — injection pattern detection

### Analytics
- **PostHog integration** — opt-in anonymous usage analytics (opt-out by default)
- **Events tracked** — `app_opened`, `chat_message_sent`, `panel_clicked`, `datasource_connected`
- **Privacy-first** — no personal data or chat content sent

### Desktop App
- **Electron shell** — Mac (DMG), Windows (NSIS), Linux (AppImage) targets
- **Standalone server bundle** — the app ships Next.js standalone output (self-contained `server.js`), not `node_modules`; runs on a dynamically allocated localhost port
- **Auto-update** — `electron-updater` with GitHub Releases, 4-hour check interval (requires a signed app on macOS)
- **Tray icon, window state persistence, splash screen, graceful shutdown**
- **Background intelligence** — periodic rule checks over live data with native notifications

## Prerequisites

- **Node.js 20+**
- **pnpm**
- **Claude CLI** installed and authenticated (`claude` command available in your terminal)

Optional backends: [Codex](https://github.com/openai/codex), [Ollama](https://ollama.com) (detected automatically).

## Setup

```bash
cp .env.example .env.local   # fill in OAUTH_PROXY_SECRET (see below)
pnpm install
pnpm dev
```

Open http://localhost:3939. The onboarding flow guides you through the rest.

`OAUTH_PROXY_SECRET` authenticates the app to the OAuth token-exchange proxy and is inlined at build time — it must match `PROXY_SECRET` on the deployed proxy (see `proxy/README.md`). Without it, datasource OAuth connects will fail.

### Connecting datasources

Connect services from onboarding or Settings. You'll be redirected to each service's OAuth page; tokens are stored locally in `~/.cockpit/tokens.json`. Granola needs no OAuth — its local cache is detected automatically.

### Desktop (Electron)

```bash
pnpm electron:dev       # development (uses the dev server on :3939)
pnpm electron:build     # next build + standalone packaging + electron-builder
pnpm electron:publish   # build and publish a release (auto-update feed)
```

### Quality

```bash
pnpm typecheck
pnpm test
```

## Architecture

```
src/
  app/
    api/                # API routes (agents, chat, datasources, projects, skills, ...)
    page.tsx            # Main dashboard (IPC-pushed data, browser polling fallback)
  components/
    columns/            # ProjectsColumn, FeedColumn, ChatColumn, ContextColumn
    layout/             # Header, NotificationBell
    renderers/          # Table, BarChart, CardGrid, Layout, Mermaid render blocks
    ui/                 # ChatMessage, CommandPalette, action/skill cards
    views/              # ContextualChatView, OnboardingView, SettingsView
  lib/
    agent-manager.ts    # Multi-agent lifecycle, warm processes, persistence
    agent-stream.ts     # Shared CLI→HTTP streaming (one chat engine)
    prompt-prelude.ts   # Per-message context: recent turns + historical items
    context.ts          # System prompt builder with live datasource context
    fs-cache.ts         # mtime-keyed JSON read cache for ~/.cockpit stores
    datasources/        # Connectors, manager (single-flight cache), token store
    knowledge/          # History writer/search + conversation persistence
    projects/           # Project store + LLM-based project inference
    skills*.ts          # Built-in defs, custom skills, extraction
electron/
  main.js               # Spawns the standalone server, tray, auto-update, IPC push
proxy/
  api/oauth/token.ts    # Vercel function holding OAuth client secrets
scripts/
  prepare-standalone.js # Copies static assets into the standalone bundle
```

## Data storage

All user data stays local:
- `~/.cockpit/tokens.json` — OAuth tokens (mode 0o600)
- `~/.cockpit/profile.json` — name, role, company
- `~/.cockpit/agents.json` — agent configurations
- `~/.cockpit/skills.json` / `custom-skills/` — skill toggles and user-created skills
- `~/.cockpit/mcp-servers.json` — MCP server configurations (mode 0o600)
- `~/.cockpit/memories/` — MEMORY.md + USER.md (mode 0o600)
- `~/.cockpit/history/` — daily datasource snapshots + conversation history
- `~/.cockpit/cache/` — offline datasource cache, project-inference cache
- `~/.cockpit/action-log.json` — executed action history
- `~/.cockpit/window-state.json`, `crash-log.json` — Electron state
- `localStorage` — chat UI state (capped, images excluded)

## Installing Unsigned DMGs (macOS)

Until the app is signed and notarized, macOS Gatekeeper will block it. After dragging **Cockpit** to Applications, either run:

```bash
xattr -cr /Applications/Cockpit.app
```

or go to **System Settings → Privacy & Security** and click **Open Anyway** after the first blocked launch attempt. Note that auto-update does not work on unsigned macOS builds.

## License

MIT — see [LICENSE](LICENSE).
