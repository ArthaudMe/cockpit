# PDR: Background Intelligence

## Problem

Cockpit is reactive — it only works when the user is looking at it and asking questions. A founder's day is full of things that should surface proactively: a meeting in 5 minutes, a PR just approved, a metric crossing a threshold. Today the user has to ask "what's happening?" instead of being told.

## Proposal

A lightweight background loop that polls datasources, evaluates conditions, and surfaces notifications — all running inside the existing Electron + Next.js process.

### Architecture

```
Electron main process
  └── Next.js server (already running)
        └── /api/background/tick  (GET, called on interval)
              ├── polls datasource data (reuses existing connectors)
              ├── evaluates rules against current state
              └── returns notifications → stored in memory
```

No new process. No daemon. The Next.js server already runs for the lifetime of the app. We add a single API route that the frontend polls, or that Electron's main process calls on a timer.

### Three tiers

**Tier 1: Time-based alerts (no LLM needed)**
- Meeting starting in 5 min → native macOS notification via Electron `Notification` API
- PR approved/merged → notification
- Linear issue assigned to you → notification
- Datasource token expiring → warning

Implementation: Pure conditional logic on the datasource data you already fetch every 30s. Compare against a "last notified" map to avoid duplicates.

**Tier 2: Daily briefing (one LLM call/day)**
- On first open of the day (or scheduled time), auto-generate a briefing
- Uses existing agent infrastructure — create a system agent that runs `/prep` against today's calendar + recent activity
- Rendered as a pinned card at the top of the chat, not a separate view

Implementation: Check `~/.cockpit/last-briefing.json` timestamp. If >18h old and app opens, trigger briefing agent. One cold LLM call.

**Tier 3: Background agents (future)**
- User-defined watchers: "tell me when competitor X ships something", "alert me if churn metric goes above 5%"
- Requires periodic LLM evaluation — expensive, deferred to later

### Feasibility with current setup

| Aspect | Status |
|--------|--------|
| App must be running | Yes — Electron must be open. No way around this without a separate daemon. Acceptable for v1. |
| Datasource polling | Already exists — 30s interval in `page.tsx`. Reuse on the server side. |
| Native notifications | Electron `Notification` API is one line. Already import `Tray` and `nativeImage`. |
| LLM availability | Claude CLI must be installed. Daily briefing fails gracefully if not available. |
| Battery/CPU impact | Tier 1 is negligible (conditional checks on data you already have). Tier 2 is one LLM call per day. Fine. |
| State persistence | `~/.cockpit/notifications.json` and `~/.cockpit/last-briefing.json`. Same pattern as existing stores. |

**Verdict: Tier 1 + 2 are straightforward. Tier 3 is a bigger lift, defer it.**

### What to build

1. `src/lib/background/rules.ts` — Rule engine: array of `{ id, check(data) => Notification | null }` functions
2. `src/lib/background/notifier.ts` — Dedup + store + emit notifications
3. `src/app/api/background/tick/route.ts` — Endpoint that runs all rules, returns new notifications
4. `src/app/api/background/briefing/route.ts` — Triggers daily briefing generation
5. Electron `main.js` — Add `setInterval` calling `/api/background/tick` every 60s. Fire native `Notification` for anything returned.
6. Frontend — Notification bell icon in header with unread count + dropdown

### Non-goals

- Running when app is closed (requires a LaunchAgent/daemon — future)
- User-defined custom rules (Tier 3 — future)
- Push notifications to phone (not a mobile app)

## Effort

~2-3 sessions. Tier 1 is mostly wiring. Tier 2 adds one agent call.
