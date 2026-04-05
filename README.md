# Cockpit

Command center for your company. Desktop AI co-pilot that connects to your live tools and lets you ask questions, get context, and take action — all from one place.

## What's live

### AI Engine Layer
- **Multi-backend LLM support** — Claude, Codex, and Ollama as interchangeable backends
- **Backend auto-detection** — scans installed binaries and versions at startup
- **Multi-agent system** — create agents with distinct names, roles (general, research, writer, ops), and custom system prompts
- **Claude process pooling** — warm single process with respawn, 30s datasource cache across messages
- **Streaming response parsing** — handles incomplete JSON blocks mid-stream without breaking
- **Skills system** — 12 built-in skills (meeting prep, writer, research, PM, data analyst, builder, UX, feedback, eng manager, people manager, sales pipeline, content marketing) with slash commands, per-skill prompt injection, and enable/disable toggles
- **Subagent spawning** — LLM can suggest spawning specialized subagents mid-conversation; user approves via inline button, subagent opens as a new tab

### Data Integrations (7 OAuth connectors + MCP)
- **Google Calendar** — next 7 days of events, auto token refresh with 5-min expiry buffer
- **Gmail** — recent emails with unread status
- **Linear** — assigned issues (excl. canceled/completed), priority mapping via GraphQL
- **GitHub** — open PRs involving user, notifications
- **Notion** — recent pages by last edit, OAuth + internal token fallback
- **Slack** — recent channel messages (past 24h), username caching
- **Granola** — meeting notes from local macOS cache (last 7 days)
- **Generic MCP client** — connect any MCP server (stdio or SSE) as a datasource. Add/test/toggle servers in Settings, resources auto-injected into AI context

### Context & Intelligence
- **Dynamic system prompt builder** — assembles user profile, projects, calendar, metrics, Slack highlights, competitors, and todos into LLM context
- **Context Focus** — 17 entity-specific focus helpers (calendar event, Linear issue, PR, Slack message, competitor, person, etc.) each with structured data and suggested questions
- **Render blocks** — Tables, bar charts, and card grids embedded inline in LLM responses via `cockpit_render` JSON format
- **Subagent suggestion blocks** — LLM can propose spawning a subagent via `cockpit_subagent` JSON; renders as an approval card in chat
- **Skill-aware responses** — active skill badge rendered inline when a skill is triggered (parser detects `[skill: /slash]` prefix)
- **Live profile integration** — user profile (name, role, company) persisted in `~/.cockpit/profile.json`, pulled into system prompt dynamically
- **Concurrent agent requests** — parallel queries with visual notifications

### Dashboard & UI
- **Live activity feed** — color-coded by type (agent, code, meeting, sales, milestone), staggered animations
- **Context sidebar panels** — Calendar (grouped by day), Metrics (MRR with change colors), Slack, Competitors, Todos, Projects
- **Chat interface** — terminal-style input, markdown rendering (headings, code blocks, bold, italic, links)
- **Contextual chat view** — breadcrumb navigation, entity-focused conversations with structured data headers and suggested questions
- **30-second live refresh** — all datasource data polled and updated automatically

### Project Management
- **Project CRUD** — create, update, delete with category, status (Active/Paused/Done), tools list
- **Project views** — tabbed: Overview (metrics + team + decisions), Issues (Linear), Activity (combined timeline)
- **File-based persistence** — `~/.cockpit/projects.json` with secure file permissions

### Auth & Token Management
- **Standardized OAuth2 flow** — per connector: auth URL generation, code exchange, token validation
- **Auto token refresh** — 5-minute buffer before expiry, transparent to caller
- **Secure token storage** — JSON in `~/.cockpit/` with `0o600` file permissions
- **OAuth popup windows** — 600x700px with 2-minute timeout polling

### Settings & Onboarding
- **4-step onboarding** — Welcome, Backend detection, Datasource connection (polls every 3s), Ready
- **Settings page** — Profile (editable name/role/company), Connected Tools (status + connect/disconnect), AI Engines (version + install status), Agents (inline rename, delete, backend selector), Skills (toggle enable/disable per skill), MCP Servers (add/test/toggle/remove)
- **Persisted state** — debounced localStorage writes (500ms)

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
- **Electron shell** — full desktop app wrapper with cross-platform support (Mac/Win/Linux)
- **Auto-update** — `electron-updater` with GitHub Releases, 4-hour check interval, restart prompt
- **Tray icon** — programmatic diamond icon, show/hide/quit menu, click to toggle
- **Window state persistence** — position/size saved to `~/.cockpit/window-state.json`
- **Background intelligence** — 60s tick with native notifications for unfocused windows
- **Graceful shutdown** — SIGTERM/SIGKILL on Unix, taskkill on Windows
- **Splash screen** — branded launch experience
- **DMG packaging** — macOS distributable

## Prerequisites

- **Node.js 20+**
- **pnpm**
- **Claude CLI** installed and authenticated (`claude` command available in your terminal)

Optional backends: [Codex](https://github.com/openai/codex), [Ollama](https://ollama.com) (detected automatically at startup)

## Setup

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. The onboarding flow will guide you through connecting your tools.

### Connecting datasources

Click "Connect" in Settings for each service you want to use. You'll be redirected to the service's OAuth page to authorize read access. Tokens are stored locally in `~/.cockpit/tokens.json`.

Supported services:
- **Google** - Calendar events (next 7 days) and recent emails
- **GitHub** - Open PRs involving you and notifications
- **Linear** - Issues assigned to you
- **Slack** - Recent channel messages
- **Notion** - Recently edited pages
- **Granola** - Meeting notes from local macOS cache (no OAuth needed)
- **MCP Servers** - Any MCP-compatible server (stdio or SSE transport)

### Electron (desktop)

```bash
pnpm electron:dev     # Development (with hot reload)
pnpm electron:build   # Build distributable DMG/installer
```

## Architecture

```
src/
  app/
    api/              # API routes (agents, chat, datasources, projects, backends, profile, skills)
    page.tsx          # Main dashboard with 30s live polling
  components/
    columns/          # ChatColumn, FeedColumn (activity feed)
    layout/           # App shell, sidebar
    renderers/        # BarChart, CardGrid, Table (render blocks)
    ui/               # ChatMessage, shared UI primitives
    views/            # ContextualChatView, OnboardingView, SettingsView
  lib/
    agent-manager.ts  # Multi-agent CRUD + role-specific prompts
    claude-pool.ts    # Warm process pool for Claude CLI
    context.ts        # System prompt builder with live context
    datasources/      # 7 OAuth connectors + MCP client + manager + token store
    focus.ts          # 17 context focus helpers
    parser.ts         # Streaming cockpit_render + cockpit_subagent JSON parser
    projects/         # Project store (file-based persistence)
    skills.ts         # Skills persistence + prompt section builder
    skills-defs.ts    # 12 skill definitions with slash commands + prompt instructions
electron/
  main.js            # Electron main process
```

## Data storage

All user data stays local:
- `~/.cockpit/tokens.json` - OAuth tokens (mode 0o600)
- `~/.cockpit/profile.json` - Name, role, company
- `~/.cockpit/projects.json` - Project definitions
- `~/.cockpit/agents.json` - Agent configurations
- `~/.cockpit/skills.json` - Enabled/disabled skills
- `~/.cockpit/mcp-servers.json` - MCP server configurations (mode 0o600)
- `~/.cockpit/memories/` - Hermes-style memory (MEMORY.md + USER.md, mode 0o600)
- `~/.cockpit/action-log.json` - Executed action history
- `~/.cockpit/window-state.json` - Electron window position/size
- `localStorage` - Chat history and UI state

## Publish Checklist (for ~100 testers)

### Blockers

- [ ] **App icon** — need 1024x1024 PNG, then generate `public/icon.icns` (Mac), `build/icon.ico` (Win), `build/icon.png` (Linux). `electron-builder` will fail without these.
- [ ] **OAuth apps created** — register OAuth apps for each service and populate `.env.local`:
  - [ ] Google (Cloud Console → OAuth 2.0, add testers to "Test users" list, max 100)
  - [ ] GitHub (Developer Settings → OAuth Apps)
  - [ ] Linear (Settings → API → Applications)
  - [ ] Slack (API → Create App → OAuth & Permissions)
  - [ ] Notion (Integrations → Create integration)
- [ ] **Bundle credentials** — credentials need to ship with the Electron build so testers don't need env vars
- [ ] **Test `electron:build`** — verify DMG works end-to-end: Next.js starts, window loads, datasources connect, actions execute
- [ ] **Code signing (Mac)** — either sign with Apple Developer cert, or document right-click → Open for unsigned DMGs

### Should-have

- [ ] **First-run onboarding** — guide new users to Settings → connect datasources on first launch
- [ ] **Scope upgrade messaging** — clear "reconnect to enable actions" prompt when existing tokens lack write scopes
- [ ] **GitHub Release** — create initial release so `electron-updater` has something to check against

### Nice-to-have

- [ ] **Windows/Linux build testing** — targets configured but untested, icons missing
- [ ] **Crash reporting** — basic error boundaries + optional telemetry for desktop stability
