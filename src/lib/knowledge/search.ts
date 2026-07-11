/**
 * History search — keyword-based search across filesystem history.
 *
 * Scores items by keyword match (title/body) and recency.
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readJsonCached } from "../fs-cache";
import type { HistoryQuery, HistoryResult } from "./types";

const HISTORY_DIR = join(homedir(), ".cockpit", "history");

// ─── Date helpers ──────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

function daysBetween(dateStr: string, referenceStr: string): number {
  const date = new Date(dateStr + "T00:00:00");
  const reference = new Date(referenceStr + "T00:00:00");
  return Math.floor(
    (reference.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
}

function recencyWeight(dateStr: string): number {
  const age = daysBetween(dateStr, todayStr());
  if (age <= 0) return 1.0;
  if (age >= 14) return 0.3;
  // Linear decay: 1.0 at day 0, 0.3 at day 14
  return 1.0 - (age / 14) * 0.7;
}

// ─── Source-to-text mapping ────────────────────────────────────────

interface SearchableItem {
  title: string;
  body: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function extractSearchable(
  source: string,
  item: Record<string, unknown>
): SearchableItem {
  switch (source) {
    case "calendar":
      return {
        title: (item.title as string) || "",
        body: `${Array.isArray(item.attendees) ? item.attendees.join(" ") : ""} ${item.description || ""}`,
        timestamp: (item.time as string) || (item.date as string) || "",
        data: item,
      };

    case "slack":
      return {
        title: `${item.channel}: ${item.author}`,
        body: (item.message as string) || "",
        timestamp: (item.time as string) || "",
        data: item,
      };

    case "linear":
      return {
        title: `${item.id}: ${item.title}`,
        body: `${item.state || ""} ${item.priority || ""} ${item.assignee || ""}`,
        timestamp: (item.updatedAt as string) || "",
        data: item,
      };

    case "github":
      return {
        title: `${item.repo}: ${item.title}`,
        body: `${item.author || ""} ${item.status || ""}`,
        timestamp: (item.time as string) || "",
        data: item,
      };

    case "github-notifications":
      return {
        title: `${item.repo}: ${item.title}`,
        body: `${item.type || ""}`,
        timestamp: (item.time as string) || "",
        data: item,
      };

    case "notion":
      return {
        title: (item.title as string) || "",
        body: (item.parent as string) || "",
        timestamp: (item.lastEdited as string) || "",
        data: item,
      };

    case "email":
      return {
        title: (item.subject as string) || "",
        body: `${item.from || ""} ${item.snippet || ""}`,
        timestamp: (item.time as string) || "",
        data: item,
      };

    case "granola":
      return {
        title: (item.title as string) || "",
        body: `${Array.isArray(item.attendees) ? item.attendees.join(" ") : ""} ${item.summary || ""} ${item.notes || ""}`,
        timestamp: (item.time as string) || "",
        data: item,
      };

    case "conversations":
      return {
        title: `Chat: ${item.role}`,
        body: (item.content as string) || "",
        timestamp: (item.timestamp as string) || "",
        data: item,
      };

    default:
      return {
        title: (item.title as string) || (item.name as string) || "",
        body: JSON.stringify(item).slice(0, 200),
        timestamp: "",
        data: item,
      };
  }
}

// ─── Scoring ───────────────────────────────────────────────────────

/** Tokenize on non-word chars, lowercased, so punctuation doesn't kill
 * exact-match. Query-side callers additionally drop short stopwords. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);
}

function scoreItem(
  title: string,
  body: string,
  queryWords: string[]
): number {
  const titleTokens = new Set(tokenize(title));
  const bodyTokens = new Set(tokenize(body));
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();

  let exactScore = 0;
  let substringScore = 0;
  let exactHits = 0;

  for (const word of queryWords) {
    const w = word.toLowerCase();
    let hit = false;

    if (titleTokens.has(w)) {
      exactScore += 10;
      hit = true;
    } else if (titleLower.includes(w)) {
      substringScore += 1;
    }

    if (bodyTokens.has(w)) {
      exactScore += 3;
      hit = true;
    } else if (bodyLower.includes(w)) {
      substringScore += 1;
    }

    if (hit) exactHits++;
  }

  // Require at least one exact-token hit before crediting substring bonuses,
  // so short/common fragments no longer match everything.
  if (exactHits === 0) return 0;
  return exactScore + substringScore;
}

// ─── Main search ───────────────────────────────────────────────────

export function searchHistory(q: HistoryQuery): HistoryResult[] {
  const limit = q.limit ?? 20;
  const fromDate = q.dateRange?.from ?? daysAgo(14);
  const toDate = q.dateRange?.to ?? todayStr();
  const sourceFilter = q.sources?.length ? new Set(q.sources) : null;
  // Tokenize on non-word chars and drop stopword-length fragments (< 3 chars)
  // so short/common words don't match everything.
  const queryWords = tokenize(q.query).filter((w) => w.length >= 3);

  if (queryWords.length === 0) return [];

  if (!existsSync(HISTORY_DIR)) return [];

  // List date directories
  let dateDirs: string[];
  try {
    dateDirs = readdirSync(HISTORY_DIR).filter((d) => {
      // Must be a valid YYYY-MM-DD format and within range
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= fromDate && d <= toDate;
    });
  } catch {
    return [];
  }

  const scored: Array<{ result: HistoryResult; score: number }> = [];

  for (const dateStr of dateDirs) {
    const dateDir = join(HISTORY_DIR, dateStr);
    const weight = recencyWeight(dateStr);

    let files: string[];
    try {
      files = readdirSync(dateDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }

    for (const file of files) {
      const source = file.replace(".json", "");

      // Apply source filter
      if (sourceFilter && !sourceFilter.has(source)) continue;

      const filePath = join(dateDir, file);
      // mtime-keyed cache: unchanged day-files aren't re-read/re-parsed on
      // every chat message (this runs on the hot path).
      const parsed = readJsonCached<Record<string, unknown>[]>(filePath, []);
      const items = Array.isArray(parsed) ? parsed : [];

      for (const item of items) {
        const searchable = extractSearchable(source, item);
        const rawScore = scoreItem(
          searchable.title,
          searchable.body,
          queryWords
        );

        if (rawScore === 0) continue;

        const finalScore = rawScore * weight;

        scored.push({
          result: {
            source,
            title: searchable.title,
            snippet: searchable.body.slice(0, 150),
            timestamp: searchable.timestamp || dateStr,
            data: searchable.data,
          },
          score: finalScore,
        });
      }
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.result);
}
