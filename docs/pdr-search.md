# PDR: Universal Search (Cmd+K)

## Problem

Cockpit has data from 7+ sources but no way to search across them. If you remember a Slack message from last week or a PR title but can't find it, you have to leave Cockpit and search each service individually.

## Proposal

Cmd+K modal that searches across all connected datasources, projects, and (if RAG is built) the knowledge index.

### Interaction model

```
┌──────────────────────────────────────────┐
│ 🔍  auth token refresh                   │
├──────────────────────────────────────────┤
│ LINEAR   Fix auth token refresh race   → │
│ GITHUB   PR #47: Token refresh fix     → │
│ SLACK    @geoff: the auth refresh is...→ │
│ MEMORY   Decided to use rotating...    → │
│ CHAT     "we discussed the auth..."    → │
└──────────────────────────────────────────┘
```

Clicking a result either:
- Opens a context-focused chat about that item (existing `ContextualChatView`)
- Opens the external URL (shift+click or secondary action)

### Architecture

Two search paths running in parallel:

**Live search** — Hit each connected service's search API directly:
- Linear: `issueSearch` GraphQL query
- GitHub: `/search/issues?q=...`
- Slack: `search.messages` API
- Notion: `/search` endpoint
- Google Calendar: `events.list` with `q=` param
- Gmail: `messages.list` with `q=` param

**Local search** — If RAG/knowledge layer exists, also vector-search the local index for semantic matches.

Results merged, deduped by URL/ID, ranked by relevance + recency.

### Differences from Cmd+P

Cmd+P is **file search** (local filesystem, for the editor). Cmd+K is **data search** (across all connected services). They're complementary.

### What to build

1. `src/lib/search/unified.ts` — Runs queries across all connectors in parallel, merges results
2. `src/lib/search/types.ts` — `SearchResult { title, snippet, source, url, timestamp }`
3. `src/app/api/search/route.ts` — `GET ?q=query` → unified search
4. `src/components/ui/CommandPalette.tsx` — Cmd+K modal (similar to QuickOpen but with source badges and richer results)
5. Modify connectors — Add `search(query)` method to each datasource connector
6. Modify `page.tsx` — Add Cmd+K listener, render CommandPalette

### Filter support

Optional source filter: `in:slack auth token` or clickable filter chips in the modal. Simple string prefix parsing, not a query language.

### Performance

All service APIs respond in <500ms. Fire all in parallel → total latency = slowest single API. Debounce input at 300ms. Show results as they stream in (don't wait for all).

## Effort

~2 sessions. The modal UI is similar to QuickOpen. Main work is adding `search()` to each connector.
