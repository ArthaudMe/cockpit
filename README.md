# cockpit
Command center for your company

## Prerequisites

- Node.js 20+
- Claude CLI installed and authenticated (`claude` command available)
- pnpm

## Setup

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000

## How it works

1. The sidebar shows your calendar, projects, metrics, Slack, competitors, and todos (loaded from `context.json`)
2. Click any sidebar item to pre-fill a question for the agent
3. The agent spawns `claude -p` as a subprocess, injecting your context as a system prompt
4. Rich responses (tables, charts, cards) render inline in the chat

## Editing context

Edit `context.json` to change the sample data shown in the sidebar and injected into the agent's context.
