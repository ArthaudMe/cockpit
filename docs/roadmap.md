# Cockpit Roadmap

What we could build next, organized by theme and sequenced by dependencies.

## Architecture Decision: CLI Subprocess + MCP

Cockpit uses the Claude CLI (`claude -p`) as its LLM transport — no API keys, no token costs, runs on the user's existing Claude subscription. Rather than migrating to raw API usage, we push the limits of this approach:

- **Tool use** — achieved by exposing an MCP server and configuring the CLI with `--mcp-config`. The CLI gets tool calling for free via MCP.
- **Multi-turn conversation** — managed in our own persistence layer. We store message history and inject recent turns into each `claude -p` call. The CLI is stateless per invocation but the orchestration layer provides continuity.
- **Structured output** — `cockpit_render` / `cockpit_subagent` JSON blocks parsed from the response stream.

This means **MCP is the foundational unlock** — it enables tool use, actions, on-demand data fetching, and multi-step reasoning without changing the LLM transport.

---

## Phase 0: Unblock Testers

### 0.1 Google OAuth Registration
Register Google OAuth credentials so testers can connect Calendar and Gmail. Currently only works with dev credentials.

- Register OAuth app in Google Cloud Console
- Configure consent screen for external users
- Bundle credentials per datasource for distribution

---

## Phase 1: MCP Server (foundational — unlocks Phases 2-4)

Expose Cockpit's datasources as an MCP server over HTTP. This is the single most important piece — it enables tool use through the CLI subprocess without any API migration.

### 1.1 MCP Server Endpoint
- Expose as a Next.js API route (`/api/mcp`), not a local process
- Any MCP client (CLI, Claude Desktop, other agents) connects over HTTP
- Standard MCP protocol (tools, resources, transport)

### 1.2 Read Tools
Expose each datasource as MCP tools the LLM can call on demand:
- `search_calendar` — query events by date range, attendee, keyword
- `search_email` — query emails by sender, subject, date, read status
- `search_linear_issues` — query by status, assignee, project, priority
- `search_github_prs` — query by state, author, repo
- `search_slack` — query messages by channel, author, keyword
- `search_notion` — query pages by title, last edited
- `search_granola` — query meeting notes by date, participant

### 1.3 Write Tools (enables Actions, Phase 3)
- `create_linear_issue`, `update_linear_issue`
- `create_calendar_event`, `update_calendar_event`
- `send_slack_message`, `react_to_slack_message`
- `create_github_comment`, `approve_github_pr`
- `draft_gmail`, `send_gmail`
- `create_notion_page`, `update_notion_page`

### 1.4 CLI Integration
- Generate `cockpit-mcp.json` config file pointing to the MCP server
- Spawn `claude --mcp-config cockpit-mcp.json -p` instead of bare `claude -p`
- The system prompt shrinks dramatically — just describes available tools instead of dumping all data

---

## Phase 2: Conversation Memory

Currently messages live in React state / localStorage only. No history across sessions, no multi-turn continuity.

### 2.1 Message Persistence
- Store conversation history (SQLite or JSON files in `~/.cockpit/`)
- Load recent conversations on app start
- Conversation list in sidebar

### 2.2 Multi-Turn via Prompt Injection
- On each `claude -p` call, inject last N messages as conversation context
- LLM sees the full thread even though each CLI call is stateless
- Trim older messages to stay within context window

### 2.3 Conversation Search
- Search past conversations by keyword
- LLM can reference prior conversations when relevant

---

## Phase 3: Actions & Write-Back

Currently Cockpit is read-only. With MCP write tools (Phase 1.3), the LLM can take actions.

### 3.1 Confirmation Flow
- When the LLM calls a write tool, render a confirmation card in chat (like subagent suggestions)
- Preview what will happen: "I'll create a Linear issue: [title], assigned to [person]"
- User approves or rejects before execution
- Undo where possible

### 3.2 Interactive Render Blocks
- Click handlers on render blocks — drill into a table row, click a bar to filter
- Action buttons on blocks — approve PR, mark todo done, reschedule meeting
- Block clicks can trigger follow-up LLM queries or direct API calls

### 3.3 Multi-Step Workflows
- Chain actions: "Schedule a meeting with the team, then post the agenda in Slack"
- The tool-use loop handles this naturally — LLM calls tools in sequence, each step informed by the previous result

---

## Phase 4: Generative Interface

The current render block system (table, bar chart, card grid) is prompt-driven component selection. The skills system and subagent spawning are already live. Next steps:

### 4.1 Artifact Panel
A persistent, editable panel beside the chat where the AI generates interactive content — dashboards, docs, forms — that the user can manipulate, not just read.

- **Persistent canvas** — render blocks stay visible and editable instead of scrolling away
- **Revise in place** — user asks the AI to update an artifact without regenerating the whole message
- **Multi-artifact tabs** — hold multiple generated views simultaneously

### 4.2 Composable Layouts
- **Nested blocks** — combine chart + table + summary in a single generated layout
- **Grid/flex arrangement** — LLM can specify layout, not just individual blocks
- **Dashboard generation** — "show me a dashboard for Project X" produces a multi-widget view

### 4.3 Dynamic Block Types
- **More built-in types** — line charts, timelines, kanban boards, forms, metric cards, sparklines, diff views
- **Plugin/registry model** — new visualization types without shipping code changes
- **Code-generated blocks** — LLM writes a small React component on the fly (sandboxed)

### 4.4 Adaptive Rendering
- With MCP tool use, the LLM fetches data first, inspects its shape, then picks the right visualization
- No more guessing chart type from prompt instructions — data-driven decisions

---

## Phase 5: Background Intelligence

### 5.1 Scheduled Jobs
- Periodic datasource sync (not just 30s polling while app is open)
- Scheduled reports — daily briefing at 8am, weekly summary on Mondays
- Webhook listeners for real-time updates (Linear, GitHub, Google push notifications)

### 5.2 Proactive Notifications
- Alert when something important happens: PR approved, meeting in 5 min, blocker assigned
- Smart batching — don't spam, group related notifications
- Notification center in the UI with history

### 5.3 Background Agents
- Long-running agents that monitor for conditions ("tell me if competitor X ships something")
- Scheduled context refresh with diffing — surface what changed since last check

---

## Phase 6: Knowledge Layer

Currently all context is live API pulls. No indexing, no semantic search.

### 6.1 Document Indexing
- Index datasource content into vector embeddings
- Incremental sync — only embed new/changed documents
- pgvector or local FAISS for storage

### 6.2 Semantic Search
- Search across all datasources with a single query
- "Find the Slack thread where we decided on the pricing model"
- Hybrid search (vector + keyword) for precision
- Exposed as an MCP tool so the LLM can search on demand

### 6.3 User Summary
- Auto-generated profile of the user's role, responsibilities, active projects
- Updated incrementally as new data comes in
- Compact persistent context in every LLM call

---

## Phase 7: Search, Collaboration & Platform

### 7.1 Universal Search
- Cmd+K search across all datasources, projects, past conversations
- Fuzzy matching with source-aware ranking
- Quick actions from search results (open, focus, ask about)

### 7.2 Team Support
- Multiple users in a workspace, shared projects
- Team-level datasource connections
- Shared conversation threads

### 7.3 Desktop Polish
- Offline support — cache last-known state, queue actions for sync
- Keyboard-first UX (Cmd+K, Cmd+1-9, vim bindings)
- Tray & menubar — quick access without full window
- Cross-platform builds (Windows, Linux)
