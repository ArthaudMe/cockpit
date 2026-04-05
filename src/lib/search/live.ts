import type { SearchResult, SearchSource } from "./types";
import { allLiveProviders } from "./live-providers";

const MAX_RESULTS = 20;

/**
 * Parse optional source filter from query.
 * Supports "in:slack some query" syntax.
 */
function parseFilter(raw: string): {
  query: string;
  sourceFilter: SearchSource | null;
} {
  const filterMatch = raw.match(/^in:(\w+)\s+(.+)$/i);
  if (!filterMatch) return { query: raw, sourceFilter: null };

  const filterKey = filterMatch[1].toLowerCase();
  const query = filterMatch[2];

  const filterMap: Record<string, SearchSource> = {
    calendar: "google_calendar",
    google_calendar: "google_calendar",
    gcal: "google_calendar",
    gmail: "gmail",
    email: "gmail",
    slack: "slack",
    linear: "linear",
    github: "github",
    gh: "github",
    notion: "notion",
    granola: "granola",
  };

  return {
    query,
    sourceFilter: filterMap[filterKey] || null,
  };
}

/**
 * Run live search across connected services via their real APIs.
 * Server-only — calls external APIs with stored OAuth tokens.
 */
export async function liveSearch(
  rawQuery: string,
): Promise<SearchResult[]> {
  const { query, sourceFilter } = parseFilter(rawQuery);

  if (!query.trim()) return [];

  // Only run providers that are connected and match the filter
  const eligible = allLiveProviders.filter((p) => {
    if (!p.isConnected()) return false;
    if (sourceFilter && !p.sources.includes(sourceFilter)) return false;
    return true;
  });

  if (eligible.length === 0) return [];

  const settled = await Promise.allSettled(
    eligible.map((p) => p.search(query)),
  );

  const allResults: SearchResult[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value);
    }
  }

  // Dedup by normalised title+source
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    const key = `${r.source}:${r.title.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by timestamp (most recent first)
  deduped.sort((a, b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return deduped.slice(0, MAX_RESULTS);
}
