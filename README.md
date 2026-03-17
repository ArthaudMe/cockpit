# Cockpit

Command center for your company. Connects to your live work tools and gives you an AI co-pilot that knows your context.

## What it does

Cockpit pulls live data from your tools (Google Calendar, Gmail, GitHub, Linear, Slack, Notion, Granola) into a unified dashboard, then lets you ask an AI agent questions grounded in that context. It runs as a desktop app (Electron) with a local Next.js server.

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

### Running as a desktop app

```bash
pnpm electron:dev     # Development (with hot reload)
pnpm electron:build   # Build distributable DMG/installer
```

## How it works

1. **Live Feed** - Dashboard shows a unified activity timeline from all connected sources, refreshed every 30 seconds
2. **Context-Aware Chat** - Click any feed item to start a focused conversation, or ask open-ended questions. The AI agent sees your full context (calendar, issues, PRs, messages, meetings)
3. **Multi-Agent** - Create multiple agents with different roles (general, research, writer, ops) and backends (Claude, Codex, Ollama)
4. **Skills** - 12 built-in skills (`/prep`, `/write`, `/research`, `/pm`, `/data`, `/build`, `/ux`, `/feedback`, `/eng`, `/team`, `/sales`, `/content`) that shape the agent's behavior for specific tasks
5. **Rich Output** - Agents can render tables, bar charts, and card grids inline in the chat
6. **Subagents** - Agents can suggest spawning specialized sub-agents for parallel work

## Project structure

```
src/
  app/api/            # API routes (agents, datasources, projects, chat)
  components/         # React components (chat, feed, settings, onboarding)
  lib/
    agent-manager.ts  # Multi-agent lifecycle and persistence
    claude-pool.ts    # Claude CLI process pooling
    context.ts        # System prompt builder with live context
    datasources/      # OAuth connectors and token management
    focus.ts          # Context focus helpers (17 entity types)
    parser.ts         # Streaming JSON parser for render blocks
    projects/         # Project CRUD and persistence
    skills-defs.ts    # Skill definitions
electron/main.js      # Electron shell
```

## Data storage

All user data stays local:
- `~/.cockpit/tokens.json` - OAuth tokens (mode 0o600)
- `~/.cockpit/profile.json` - Name, role, company
- `~/.cockpit/projects.json` - Project definitions
- `~/.cockpit/agents.json` - Agent configurations
- `localStorage` - Chat history and UI state
