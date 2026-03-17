# Cockpit Details

Technical overview of what's been built, current capabilities, and what's next.

## Core Architecture

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind CSS
- **Desktop:** Electron 41 with electron-builder (DMG, NSIS, AppImage)
- **AI Backends:** Claude CLI (process pooling), Codex, Ollama
- **Package Manager:** pnpm

All user data is stored locally. No cloud database, no server deployment. The Next.js server runs inside Electron on the user's machine.

## Live Features

### Multi-Agent System

- Create unlimited agents with distinct names, roles (general, research, writer, ops), and custom system prompts
- Each agent maintains separate chat history persisted in localStorage
- Backend and model selection per agent (Claude Sonnet/Opus/Haiku, Codex o4-mini/o3/gpt-4.1, Ollama Llama/Qwen/DeepSeek/Gemma)
- Auto-detection of installed backends at startup with version reporting
- Streaming responses with keyboard shortcuts (Enter to send, Shift+Enter for newline)

### Skills System (12 Skills)

Pre-built skills that shape agent behavior for specific tasks:

| Skill | Command | Purpose |
|-------|---------|---------|
| Meeting Prep & Follow-up | `/prep` | Prepare for or debrief meetings |
| Writer | `/write` | Draft emails, docs, announcements |
| Research & Intel | `/research` | Deep research on topics or competitors |
| Product Manager | `/pm` | Prioritization, specs, user stories |
| Data Analyst | `/data` | Analyze metrics, build reports |
| Builder | `/build` | Architecture, implementation plans |
| UX & Design | `/ux` | UX critique, design suggestions |
| User Feedback | `/feedback` | Synthesize user feedback |
| Engineering Manager | `/eng` | Sprint planning, tech debt |
| People & Team | `/team` | Team health, 1:1 prep, hiring |
| Sales Pipeline | `/sales` | Pipeline review, outreach |
| Content Marketing | `/content` | Blog posts, social, newsletters |

Skills detected via `[skill: /slash]` prefix in LLM response. Enable/disable per skill in settings. Slash command autocomplete with Tab.

### Subagent Spawning

The LLM can suggest creating new specialized agents mid-conversation via `cockpit_subagent` JSON blocks. User approves via inline button, and the subagent opens as a new tab with its task pre-populated.

### Datasource Integrations (7 Connectors)

All OAuth connectors support auto-refresh with 5-minute expiry buffer.

| Service | Data Pulled | Auth |
|---------|------------|------|
| Google | Next 7 days calendar + recent emails (unread status) | OAuth2 |
| GitHub | Open PRs involving user + notifications | OAuth2 |
| Linear | Assigned issues (excl. canceled/completed) | OAuth2 + GraphQL |
| Slack | Recent channel messages (24h window) + username cache | OAuth2 |
| Notion | Recently edited pages | OAuth2 + internal token fallback |
| Granola | Meeting notes from local macOS cache (7-day window) | Local file system |

**Token management:** Stored in `~/.cockpit/tokens.json` with `0o600` permissions. Auto-refresh with 5-minute buffer before expiry. Refresh token rotation where supported.

### Context Engine

**Dynamic System Prompt Builder** (`context.ts`)
- Assembles user profile (name, role, company) from `~/.cockpit/profile.json`
- Injects live calendar, metrics, Slack highlights, Linear issues, GitHub PRs, emails, Notion pages, Granola meeting notes
- Rebuilt on every message to include latest data
- 30-second datasource cache prevents redundant API calls

**Context Focus** (17 entity-specific helpers)
- Calendar event, Linear issue, GitHub PR, Slack message, competitor, person, project, metric, etc.
- Each focus provides structured data + suggested follow-up questions
- Clicking a feed item starts a contextual conversation

### Rich Output (Render Blocks)

Agents can output structured JSON that renders as visual components:

- **Table** - for comparisons, metrics, lists
- **Bar Chart** - for numeric comparisons
- **Card Grid** - for project summaries, activity feeds

Parsed mid-stream (handles incomplete JSON during streaming). Mixed naturally with markdown text.

### Dashboard

**Live Activity Feed** - Unified timeline combining all datasources:
- Calendar events, GitHub PRs/notifications, Linear issues, Slack messages, Granola meeting notes, Notion page updates, recent emails
- Color-coded by entity type, sorted by recency
- 30-second auto-refresh while app is in foreground

**Sidebar Panels** - Calendar (grouped by day), metrics (with trend colors), Slack highlights, competitors, todos, projects

### Settings and Onboarding

**4-Step Onboarding:**
1. Welcome screen
2. Backend detection (scans for claude, codex, ollama)
3. Datasource connection (polls until user connects desired tools)
4. Ready screen

**Settings Page:**
- Profile (name, role, company)
- Connected tools (connect/disconnect per service)
- AI engines (installed status with versions)
- Agents (rename, delete, change backend per agent)
- Skills (toggle per skill)

### Project Management

- Create, update, delete projects with name, description, category, status, tools
- 3 views per project: Overview, Issues, Activity
- Persisted to `~/.cockpit/projects.json`

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agents` | GET, POST | List/create agents |
| `/api/agents/[id]` | PATCH, DELETE | Update/delete agent |
| `/api/agents/[id]/chat` | POST | Send message (streaming) |
| `/api/datasources` | GET | List datasource status |
| `/api/datasources/connect` | POST | Initiate OAuth |
| `/api/datasources/callback` | GET | OAuth callback |
| `/api/datasources/disconnect` | POST | Disconnect service |
| `/api/datasources/data` | GET | Fetch live data (all sources) |
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/[id]` | GET, PATCH, DELETE | Project CRUD |
| `/api/projects/scan` | POST | Auto-scan GitHub/Linear |
| `/api/profile` | GET, PATCH | User profile |
| `/api/skills` | GET | List skills |
| `/api/backends` | GET | List detected backends |
| `/api/detect-backends` | POST | Re-scan for binaries |
| `/api/status` | GET | Health check |

## Roadmap (Not Yet Built)

### Generative Interface
- Artifact panel (persistent, editable canvas beside chat)
- Interactive render blocks (click handlers, inline editing, write-back from blocks)
- Composable layouts (nested blocks, grid/flex, dashboard generation)
- Dynamic block types (plugin registry, more chart types, code-generated blocks)

### MCP Support
- Expose Cockpit datasources as an MCP server for external LLM clients
- Connect to external MCP servers as additional datasources

### Background Intelligence
- Scheduled reports (daily briefing, weekly summary)
- Proactive notifications (PR approved, meeting in 5 min, blocker assigned)
- Background agents (monitor for conditions and act)

### RAG and Knowledge Layer
- Vector embeddings for all datasource content
- Semantic search across all sources
- Conversation memory (persist and search past chats)
- Auto-generated user summary updated incrementally

### Write-Back Actions
- Create/update Linear issues, comment on GitHub PRs, schedule calendar events, draft emails, send Slack messages, update Notion pages
- Confirmation flow (AI proposes, user confirms)
- Multi-step workflows

### Search
- Cmd+K universal search across datasources, projects, conversations
- Filtered search by source, date, project, person

### Collaboration
- Multi-user workspaces, shared projects, team context
- Shared datasource connections and conversation threads

### Desktop Polish
- Offline caching, keyboard-first UX, tray/menubar integration
- Windows and Linux testing
