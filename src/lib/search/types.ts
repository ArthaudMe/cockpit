import type { DatasourceData } from "@/lib/datasources/types";

export type SearchSource =
  | "google_calendar"
  | "gmail"
  | "slack"
  | "linear"
  | "github"
  | "notion"
  | "granola";

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  source: SearchSource;
  url?: string;
  timestamp?: string;
  /** Relevance score — higher is better. Used for sorting. */
  score?: number;
}

/**
 * Local search provider — searches already-fetched DatasourceData in memory.
 */
export interface SearchProvider {
  source: SearchSource;
  search(query: string, data: DatasourceData): SearchResult[];
  isAvailable(data: DatasourceData): boolean;
}

/**
 * Live search provider — makes real-time API calls to external services.
 */
export interface LiveSearchProvider {
  sources: SearchSource[];
  search(query: string): Promise<SearchResult[]>;
  isConnected(): boolean;
}
