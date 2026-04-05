export interface HistoryQuery {
  query: string;
  sources?: string[];
  dateRange?: { from: string; to: string };
  limit?: number;
}

export interface HistoryResult {
  source: string;
  title: string;
  snippet: string;
  timestamp: string;
  data: Record<string, unknown>;
}
