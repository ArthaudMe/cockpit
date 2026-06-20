# Manual Test Plan

Pre-publish checklist for verifying Cockpit features end-to-end.

## 1. App Launch & Onboarding

- [ ] `pnpm dev` starts without errors on http://localhost:3000
- [ ] First-run onboarding shows 4 steps: Welcome, Engine detection, Datasource connection, Ready
- [ ] Backend detection correctly identifies installed Claude CLI / Codex / Ollama
- [ ] Skipping onboarding lands on the main dashboard

## 2. Dashboard — Context Column

- [ ] **Calendar panel** shows "Connect Google" prompt when Google is not connected
- [ ] **Calendar panel** shows events grouped by day (Today, Tomorrow, etc.) when connected
- [ ] **Slack panel** shows "Connect Slack" prompt when Slack is not connected
- [ ] **Metrics panel** only renders when `usage_analytics` data exists
- [ ] **Competitors panel** only renders when `competitor_updates` data exists
- [ ] **Skills panel** shows 5 built-in chips: Analyst, PM, Sales, Admin, Finance
- [ ] **Skills panel** loads and displays custom skills (purple-tinted) from `/api/skills/custom`
- [ ] Clicking a skill chip prefills the chat input with the skill's slash command
- [ ] **Todo panel** shows todo count and toggle checkboxes
- [ ] Todo state persists across page reloads (localStorage)

## 3. Chat

- [ ] Send a message and receive a streaming response
- [ ] Markdown renders: headings, bold, italic, code blocks, links, lists
- [ ] **Render blocks** — ask a question that triggers a table, bar chart, or card grid
- [ ] **Subagent suggestion** — response contains a `cockpit_subagent` block showing "Spawn agent" button
- [ ] **Action cards** — response proposes an action (e.g. `linear_create_issue`), shows approval card
- [ ] **Skill proposal** — response contains a `cockpit_skill` block showing purple save/dismiss card
- [ ] Clicking "Save" on a skill proposal creates the custom skill (verify in Settings > Custom Skills)
- [ ] **Skill tag** — when a skill is active, response shows the skill badge at the top
- [ ] **File references** — paths like `src/lib/foo.ts:42` render as clickable chips
- [ ] `/saveskill` command in chat — type `/saveskill` and verify the AI proposes a skill

## 4. Search (Cmd+K)

- [ ] Cmd+K opens the command palette
- [ ] Typing shows instant client-side results from cached data
- [ ] After 500ms, live API results appear with LIVE badge
- [ ] Source filtering works: `in:slack`, `in:linear`, `in:github`, etc.
- [ ] Results are grouped by source with color-coded badges
- [ ] Keyboard navigation (arrow keys) and Enter to select work
- [ ] Shift+Enter opens the item URL in a new tab

## 5. Settings

### Profile
- [ ] Name, role, company fields are editable (click to edit, Enter to save)
- [ ] Profile changes persist after page reload

### Connected Tools
- [ ] Each datasource shows correct status (green dot = connected, grey = disconnected)
- [ ] "Connect" button opens OAuth popup (600x700px)
- [ ] After OAuth, status updates to connected (polling every 2s)
- [ ] "Disconnect" button removes the connection
- [ ] **Scope upgrade banner** — connected services needing write scopes show yellow warning + "Reconnect" button

### MCP Servers
- [ ] "+ Add" button shows the add form
- [ ] Can add stdio and SSE transport servers
- [ ] "Test" button tests connection and shows result
- [ ] Toggle switch enables/disables servers
- [ ] "Remove" button deletes the server

### Built-in Skills
- [ ] All 12 built-in skills shown in 2-column grid
- [ ] Toggle switch enables/disables each skill
- [ ] Active count updates in section header

### Custom Skills
- [ ] "+ Create" button shows the create form
- [ ] Form has: Name, Icon, Slash command, Description, Prompt instruction fields
- [ ] "Create Skill" button saves and shows the skill in the list (purple-tinted card)
- [ ] "Delete" button removes the custom skill
- [ ] Custom skills appear in the dashboard Skills panel after creation
- [ ] Empty state shows helpful message

### AI Engines
- [ ] Shows detected backends (Claude, Codex, Ollama) with install status
- [ ] Green/red dot correctly reflects installed state

### Agents
- [ ] Agent cards show name, role, engine selector
- [ ] Click name to rename agent
- [ ] Engine dropdown switches backend
- [ ] Delete button removes agent (only if >1 agent)

### Analytics
- [ ] Toggle switch enables/disables PostHog analytics

## 6. Contextual Chat View

- [ ] Clicking a calendar event opens contextual chat with event details
- [ ] Clicking a Slack message opens contextual chat with message context
- [ ] Clicking a metric opens contextual chat with metric data
- [ ] Breadcrumb navigation shows entity path
- [ ] Suggested questions appear and are clickable
- [ ] Back button returns to main view

## 7. Error Handling & Crash Reporting

- [ ] **React ErrorBoundary** — force a render error (e.g. corrupt localStorage) and verify:
  - Error screen appears with "Something went wrong" message
  - "Reload" button refreshes the page
  - "Dismiss" button returns to normal view
- [ ] **Global error listeners** — open DevTools console, run `throw new Error("test")`, verify no app crash
- [ ] **Electron crash log** — check `~/.cockpit/crash-log.json` exists after any error

## 8. Brain-First Protocol

- [ ] Ask the AI a question about your data — it should reference connected datasources before suggesting external lookups
- [ ] Ask about something previously discussed — it should check memory/history first
- [ ] Verify memory files exist at `~/.cockpit/memories/` after a conversation with memory-worthy content

## 9. Electron Desktop (if testing DMG)

- [ ] DMG opens and app can be dragged to Applications
- [ ] Right-click → Open bypasses Gatekeeper warning on first launch
- [ ] App window appears with correct icon
- [ ] Tray icon shows in menu bar with show/hide/quit options
- [ ] Window position/size persists after restart (`~/.cockpit/window-state.json`)
- [ ] Auto-update check doesn't crash (even if no release exists yet)
- [ ] `render-process-gone` triggers auto-reload

## 10. Data Storage Verification

- [ ] `~/.cockpit/tokens.json` — exists with mode 0600 after connecting a service
- [ ] `~/.cockpit/profile.json` — updates when profile is edited
- [ ] `~/.cockpit/skills.json` — updates when skills are toggled
- [ ] `~/.cockpit/custom-skills/` — contains JSON files after creating custom skills
- [ ] `~/.cockpit/memories/` — contains MEMORY.md and USER.md after memory writes
- [ ] `~/.cockpit/action-log.json` — logs executed actions

## 11. Edge Cases

- [ ] Empty state: no datasources connected, no todos, no events — app renders cleanly
- [ ] Rapid toggling of skill/MCP switches doesn't cause race conditions
- [ ] Very long chat messages don't break layout (word-break works)
- [ ] Multiple browser tabs — localStorage sync doesn't conflict
- [ ] Network offline — app shows graceful degradation, not crashes
