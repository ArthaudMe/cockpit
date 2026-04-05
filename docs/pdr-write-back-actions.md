# PDR: Write-Back Actions

## Problem

Cockpit is read-only. Agents can tell you "you should reply to that PR" but can't do it. You have to context-switch to GitHub/Linear/Slack to take the action. The whole point of an AI copilot is to act, not just advise.

## Proposal

Let agents propose actions (create issue, send message, schedule event), show the user a confirmation card, and execute on approval.

### Interaction model

```
User: "Create a Linear issue for the auth bug we discussed"

Agent: Here's what I'll create:
┌─────────────────────────────────────┐
│ CREATE LINEAR ISSUE                 │
│                                     │
│ Title: Fix auth token refresh race  │
│ Team: Engineering                   │
│ Priority: High                      │
│ Description: When two tabs refresh  │
│ simultaneously, the second...       │
│                                     │
│        [Edit]  [Create]  [Cancel]   │
└─────────────────────────────────────┘
```

The agent outputs a structured JSON block (like existing render blocks). The frontend renders it as an action card. User clicks Create → frontend calls the write-back API → API calls the external service.

### Supported actions (v1)

| Action | Service | API |
|--------|---------|-----|
| Create issue | Linear | GraphQL mutation |
| Comment on PR | GitHub | REST API |
| Send message | Slack | `chat.postMessage` |
| Create event | Google Calendar | Calendar API v3 |
| Draft email | Gmail | Gmail API (draft, not send) |
| Update page | Notion | Notion API |

All connectors already have OAuth tokens stored. We just need the write endpoints — the auth is solved.

### Architecture

```
Agent response
  └── Detects `cockpit_action` JSON block (like cockpit_render)
        └── Frontend renders ActionCard component
              └── User clicks [Execute]
                    └── POST /api/actions/execute { type, params }
                          └── Calls external API with stored OAuth token
                                └── Returns result → shown in chat
```

### Action block format

```json
{
  "cockpit_action": "linear_create_issue",
  "params": {
    "title": "Fix auth token refresh race",
    "description": "...",
    "teamId": "ENG",
    "priority": 2
  },
  "confirm": true
}
```

`confirm: true` means show the card and wait for approval. Future: `confirm: false` for trusted/low-risk actions (e.g., adding a comment).

### Safety model

- **All actions require explicit user confirmation in v1.** No auto-execute.
- Agent cannot send emails — only draft them. User sends manually.
- Destructive actions (delete issue, close PR) not supported in v1.
- Action execution is logged to `~/.cockpit/action-log.json` for auditability.

### What to build

1. `src/lib/actions/types.ts` — Action type definitions and param schemas
2. `src/lib/actions/executor.ts` — Dispatch to correct connector's write method
3. `src/lib/actions/log.ts` — Append-only action log
4. `src/app/api/actions/execute/route.ts` — Execute an approved action
5. `src/components/ui/ActionCard.tsx` — Render block for proposed actions
6. Modify `src/lib/parser.ts` — Parse `cockpit_action` blocks from agent output
7. Modify connectors — Add write methods (e.g., `createLinearIssue()`, `postSlackMessage()`)
8. Modify system prompt — Tell agents about available actions and the JSON format

### What not to build (yet)

- Auto-execute without confirmation
- Multi-step workflows (e.g., "create issue then assign and notify in Slack")
- Undo/rollback
- Batch actions

## Effort

~3 sessions. Most work is in the connector write methods (one per service). The action card UI and parser are small.
