# PDR: Knowledge Layer (Filesystem-First)

## Problem

Cockpit feeds live context into every agent message (calendar, Slack, PRs, etc.), but it has no memory of past data. If a Slack message scrolled off the 24h window, it's gone. If you discussed a decision last week, the agent doesn't know. The context window is the only memory, and it resets every conversation.

## Why not traditional RAG?

The original PDR proposed a full vector store with embeddings. Research since then (LlamaIndex 2026 benchmarks, Claude Code's own architecture, OpenClaw) shows:

- **Filesystem agents outscore RAG** on both correctness (+2 pts) and relevance (+1.6 pts) in benchmarks
- **Claude Code dropped RAG** in favor of agentic search (grep, glob, read) — the model decides what to search, no chunking/embedding needed
- **RAG's weaknesses are real**: chunking causes context loss, embeddings go stale, and it requires infrastructure (embedding model, vector DB, re-indexing pipeline)
- **Cockpit's data is already structured** — calendar events, Slack messages, Linear issues are small discrete items. Chunking them makes no sense.

## Proposal

Filesystem-first knowledge layer. Persist all datasource data as plain JSON files organized by date. Agent searches with keyword/date filtering. No embeddings, no vector DB, no new dependencies.

Optional Tier 2: add a vector index on top later if keyword search proves insufficient for semantic queries.

### Architecture

```
Datasource poll (every 30s)
  └── New/changed items
        └── Deduplicate against existing files
              └── Append to ~/.cockpit/history/{date}/{source}.json

Agent query ("what did we discuss about auth last week?")
  └── Search module scans history files
        ├── Date range filter (last 7 days)
        ├── Source filter (optional)
        └── Keyword match + simple relevance scoring
              └── Top results injected into agent context
```

### Storage format

```
~/.cockpit/history/
  2026-04-05/
    calendar.json      # Array of CalendarEvent objects
    slack.json         # Array of SlackMessage objects
    linear.json        # Array of LinearIssue objects
    github.json        # Array of GitHubPR + GitHubNotification
    notion.json        # Array of NotionPage objects
    email.json         # Array of EmailThread objects
    granola.json       # Array of GranolaMeeting objects
    conversations.json # Array of { role, content, timestamp, agentId }
```

Each file is an append-only JSON array for that day. Items are deduped by a stable ID (event ID, message timestamp, issue ID, etc.) so re-polling doesn't create duplicates.

**Why JSON, not markdown?** The data is already typed (CalendarEvent, SlackMessage, etc.). JSON preserves structure for filtering and is what the datasource connectors already produce. No conversion step needed.

### Search module

`src/lib/knowledge/search.ts` — Single module with a simple, fast search:

```typescript
interface HistoryQuery {
  query: string;           // keyword search
  sources?: string[];      // filter by source type
  dateRange?: {            // filter by date
    from: string;          // ISO date
    to: string;
  };
  limit?: number;          // max results (default 20)
}

interface HistoryResult {
  source: string;
  title: string;
  snippet: string;
  timestamp: string;
  data: Record<string, unknown>;  // full original item
}

function searchHistory(q: HistoryQuery): HistoryResult[]
```

Search algorithm:
1. List date directories within the date range (default: last 14 days)
2. Read matching source files (or all if no source filter)
3. For each item, score against query keywords (title match > body match, exact word > substring)
4. Sort by score * recency weight
5. Return top N results

This is essentially the same approach as the Cmd+K search we already built, but running against the historical filesystem instead of the in-memory 30s cache.

### Context injection

Two modes, same as before:

1. **Automatic** — Before every agent message, run `searchHistory({ query: userMessage, limit: 5 })`. If results exist, inject as a `[Historical context]` section in the system prompt. Silent to the user.

2. **Explicit** — Agent has a `search_history` tool it can call. User asks "what did we discuss about auth last week?" → agent calls `searchHistory({ query: "auth", dateRange: { from: "2026-03-29", to: "2026-04-05" } })`.

### Conversation persistence

After each chat exchange, append `{ role, content, timestamp, agentId }` to `~/.cockpit/history/{today}/conversations.json`. This gives agents cross-session memory — previous conversations are searchable just like Slack messages or calendar events.

Dedup by hashing `role + content + timestamp`.

### What to build

1. `src/lib/knowledge/writer.ts` — On each datasource poll, diff against existing day file, append new items. One function per source type to extract stable IDs for dedup.
2. `src/lib/knowledge/search.ts` — Read history files, keyword search with scoring, date/source filtering.
3. `src/lib/knowledge/types.ts` — HistoryQuery, HistoryResult types.
4. `src/app/api/knowledge/search/route.ts` — `GET ?q=query&from=date&to=date&sources=slack,calendar` → search results.
5. Modify `src/lib/context.ts` — Auto-inject historical context before building system prompt.
6. Modify `src/app/api/chat/route.ts` — Persist conversation messages after each exchange.
7. Modify `src/app/api/datasources/data/route.ts` — After fetching data, call writer to persist to history.

### Files to modify (existing)

- `src/app/api/datasources/data/route.ts` — hook in the writer after successful fetch
- `src/lib/context.ts` — add historical context injection
- `src/app/api/chat/route.ts` — persist conversations

## Tier 2: Vector index (future, only if needed)

If keyword search proves too limited (e.g., "that thing about scaling" doesn't match "horizontal auto-scaling discussion"), add a vector layer:

- Keep the filesystem as source of truth
- Add a lightweight vector index (sqlite-vec or ChromaDB) alongside
- When a JSON file changes, re-index affected items automatically
- Search checks both keyword and vector results, merges and ranks

This is the hybrid approach (OpenClaw model). But don't build it until keyword search actually fails — it may never be needed given how structured the data is.

## What this replaces from the original PDR

| Original | New |
|----------|-----|
| SQLite + sqlite-vec | Plain JSON files on disk |
| Ollama/OpenAI embeddings | Keyword search with scoring |
| Embedding pipeline + indexer | Simple JSON append on poll |
| Vector cosine similarity | Keyword match + recency weight |
| ~3-4 sessions | ~1-2 sessions |
| Requires Ollama or OpenAI key | Zero new dependencies |

## Risks

- **Disk usage** — A year of data ≈ 50k items ≈ ~50MB of JSON. Trivial.
- **Search speed** — Reading 14 days of JSON files and keyword matching is <100ms for typical volumes. If it gets slow, add a simple index file.
- **Keyword search misses semantic matches** — True, but most queries are specific enough ("auth token", "Q2 metrics", person names). Tier 2 addresses this if needed.
- **Privacy** — Everything stays in `~/.cockpit/history/`. No cloud. User can `rm -rf` to reset.

## Effort

~1-2 sessions. The writer is straightforward (JSON append with dedup). The search reuses patterns from the existing Cmd+K search. Context injection is a small modification to the existing system prompt builder.
