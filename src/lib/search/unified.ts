import type { DatasourceData } from "@/lib/datasources/types";
import type { SearchResult, SearchSource } from "./types";
import { allProviders } from "./providers";

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
 * Run client-side search across all datasource data in memory.
 * No API calls — filters the already-fetched DatasourceData.
 *
 * Results are scored by relevance (title match > snippet match) + recency,
 * then capped at 20 results.
 */
export function unifiedSearch(
  rawQuery: string,
  data: DatasourceData,
): SearchResult[] {
  const { query, sourceFilter } = parseFilter(rawQuery);

  if (!query.trim()) return [];

  // Run all providers that have data
  const allResults: SearchResult[] = [];

  for (const provider of allProviders) {
    // Skip providers that don't match the source filter
    if (sourceFilter && provider.source !== sourceFilter) continue;
    // Skip providers with no data
    if (!provider.isAvailable(data)) continue;

    const results = provider.search(query, data);
    allResults.push(...results);
  }

  // Dedup by id
  const seen = new Set<string>();
  const deduped = allResults.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Sort by score (descending), then by timestamp (most recent first)
  deduped.sort((a, b) => {
    const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;

    // Tiebreak by timestamp
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return deduped.slice(0, MAX_RESULTS);
}
