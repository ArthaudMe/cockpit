# PDR: Generative Interface (v2)

## Problem

The file editor was step one — agents can now surface files. But the vision is broader: agents should be able to generate and manipulate rich UI artifacts (dashboards, documents, diagrams) that persist beside the chat.

## What's done

- File chips in chat messages (click to open)
- Monaco editor panel replacing right column
- Multi-tab file editing with save
- Cmd+P quick-open

## What's next

### Interactive render blocks

Current render blocks (table, bar_chart, card_grid) are read-only. Next step:

- **Click handlers** — Click a row in a table → open context-focused chat about that item
- **Inline editing** — Edit a cell in a table → agent sees the change, can react
- **Write-back** — "Update this Linear issue" button inside a card → triggers action (see write-back PDR)

Implementation: Add `onClick`, `onEdit` callbacks to render block components. Pass interaction events back to the agent as follow-up messages.

### Artifact panel

Upgrade from "file editor in right column" to a general-purpose artifact panel:

- Agent can create artifacts: documents, spreadsheets, diagrams, code
- Artifacts persist across conversations (stored in `~/.cockpit/artifacts/`)
- Artifact panel shows the artifact, chat panel shows the conversation about it
- Agent can reference and modify artifacts by ID

This is essentially Claude's artifact system, but local and editable.

### Composable layouts

Agent can output layout instructions:

```json
{
  "cockpit_render": "layout",
  "direction": "row",
  "children": [
    { "cockpit_render": "bar_chart", ... },
    { "cockpit_render": "table", ... }
  ]
}
```

Enables agents to generate mini-dashboards inline in chat.

### Dynamic block types

Plugin registry for render blocks. Today we hardcode table/chart/card. Future:

- Code block with execution (run JS/Python in sandbox)
- Mermaid diagram rendering
- Kanban board
- Timeline / Gantt chart
- Map visualization

Each block type is a React component registered by name. Agent outputs `cockpit_render: "mermaid"` and the registry finds the right component.

## Priority order

1. Interactive render blocks (click handlers) — small lift, high impact
2. Artifact panel — medium lift, changes the UX model
3. Composable layouts — medium lift, depends on artifact panel
4. Dynamic block types — ongoing, add as needed

## Effort

Interactive render blocks: ~1 session. Artifact panel: ~2-3 sessions. Layouts + plugins: ongoing.
