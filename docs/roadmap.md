# Cockpit Roadmap

What we could build next, organized by theme. Priorities and sequencing TBD.

---

## 1. Generative Interface

The current render block system (table, bar chart, card grid) is prompt-driven component selection — the LLM picks from a fixed menu of 3 read-only visualizations. The skills system (12 skills with slash commands) and subagent spawning (LLM suggests, user approves) are already live — these are the first steps toward agentic UI. To get to a full generative interface:

### 1.1 Artifact Panel
A persistent, editable panel beside the chat (like Claude artifacts or ChatGPT canvas) where the AI generates full interactive content — dashboards, docs, forms — that the user can manipulate, not just read.

- **Persistent canvas** — render blocks stay visible and editable instead of scrolling away with the conversation
- **Revise in place** — user can ask the AI to update an artifact without regenerating the whole message
- **Multi-artifact tabs** — hold multiple generated views simultaneously

### 1.2 Interactive Render Blocks
- **Click handlers** — drill into a table row, click a bar to filter, expand a card
- **User actions from blocks** — approve a PR, reschedule a meeting, mark a todo done, reply to a Slack message directly from a rendered block
- **Inline editing** — edit values in a generated table or form, feed changes back to the LLM

### 1.3 Composable Layouts
- **Nested blocks** — combine chart + table + summary in a single generated layout
- **Grid/flex arrangement** — LLM can specify layout, not just individual blocks
- **Dashboard generation** — "show me a dashboard for Project X" produces a multi-widget view

### 1.4 Dynamic Block Types
- **Plugin/registry model** — new visualization types without shipping code changes
- **More built-in types** — line charts, timelines, kanban boards, forms, metric cards, sparklines, diff views
- **Code-generated blocks** — LLM writes a small React component on the fly (sandboxed)

### 1.5 Tool-Use Loop
- **Multi-step rendering** — LLM calls tools, inspects results, then decides what to render based on the data (not single-shot)
- **Adaptive visualization** — choose chart type based on data shape rather than hardcoding in prompt

---

## 2. MCP (Model Context Protocol) Support

Expose Cockpit's datasources as an MCP server so external LLM clients (Claude Desktop, other agents) can query user data.

### 2.1 MCP Server
- Expose datasource data (calendar, email, issues, PRs, messages) as MCP resources
- Expose actions (create issue, send message, reschedule event) as MCP tools
- HTTP transport at a local endpoint

### 2.2 MCP Client
- Connect to external MCP servers as additional datasources
- Let agents call tools from connected MCP servers during conversations

---

## 3. Scheduled Jobs & Background Intelligence

### 3.1 Cron / Scheduler
- Periodic datasource sync (not just 30s polling while app is open)
- Scheduled reports — daily briefing generated at 8am, weekly summary on Mondays
- Webhook listeners for real-time updates (Linear, GitHub, Google push notifications)

### 3.2 Proactive Notifications
- Alert when something important happens: PR approved, meeting in 5 min, blocker assigned
- Smart batching — don't spam, group related notifications
- Notification center in the UI with history

### 3.3 Background Agents
- Long-running agents that monitor for conditions and act (e.g., "tell me if competitor X ships something")
- Scheduled context refresh with diffing — surface what changed since last check

---

## 4. RAG & Knowledge Layer

Currently all context is live API pulls. No persistence, no search, no memory across sessions.

### 4.1 Document Indexing
- Index datasource content into vector embeddings (calendar events, emails, messages, issues)
- Incremental sync — only embed new/changed documents
- pgvector or local FAISS for storage

### 4.2 Semantic Search
- Search across all datasources with a single query
- "Find the Slack thread where we decided on the pricing model"
- Hybrid search (vector + keyword) for precision

### 4.3 Conversation Memory
- Persist chat history server-side (not just localStorage)
- Search past conversations
- LLM can reference prior conversations for continuity

### 4.4 User Summary
- Auto-generated profile of the user's role, responsibilities, active projects
- Updated incrementally as new data comes in
- Used as persistent context in every LLM call

---

## 5. Actions & Write-Back

Currently Cockpit is read-only — it pulls data but can't act on it.

### 5.1 Datasource Write APIs
- **Linear** — create/update issues, change status, assign
- **GitHub** — comment on PRs, approve/request changes, merge
- **Google Calendar** — create/move/cancel events
- **Gmail** — draft/send replies
- **Slack** — send messages, react, create threads
- **Notion** — create/update pages

### 5.2 Confirmation Flow
- AI proposes an action, user confirms before execution
- Preview what will happen (e.g., "I'll create this Linear issue with these fields")
- Undo where possible

### 5.3 Multi-Step Workflows
- Chain actions: "Schedule a meeting with the team to discuss this PR, then post the agenda in Slack"
- Conditional logic: "If the build passes, merge the PR"

---

## 6. Search

### 6.1 Universal Search
- Cmd+K search across all datasources, projects, past conversations
- Fuzzy matching with source-aware ranking
- Quick actions from search results (open, focus, ask about)

### 6.2 Filtered Search
- Filter by source (only Slack, only GitHub), date range, project, person
- Saved searches / filters

---

## 7. Collaboration & Multi-User

### 7.1 Team Support
- Multiple users in a workspace, shared projects
- See what teammates are working on
- Shared agent configurations

### 7.2 Shared Context
- Team-level datasource connections (shared Slack workspace, shared Linear team)
- Shared conversation threads

---

## 8. Desktop & Platform Polish

### 8.1 Offline Support
- Cache last-known datasource state for offline viewing
- Queue actions taken offline, sync when back

### 8.2 Keyboard-First UX
- Full keyboard navigation (Cmd+K search, Cmd+1-9 for panels, etc.)
- Vim-style bindings option

### 8.3 Tray & Menubar
- Quick access from menubar without opening full window
- Show upcoming calendar, unread count, active agent status

### 8.4 Cross-Platform
- Windows and Linux builds (electron-builder already configured but untested)
