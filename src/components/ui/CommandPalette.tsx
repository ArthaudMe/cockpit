"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { SearchResult, SearchSource } from "@/lib/search/types";
import type { DatasourceData } from "@/lib/datasources/types";
import { unifiedSearch } from "@/lib/search/unified";

const SOURCE_BADGES: Record<
  SearchSource,
  { label: string; bg: string }
> = {
  linear: { label: "LINEAR", bg: "#5E6AD2" },
  github: { label: "GITHUB", bg: "#238636" },
  slack: { label: "SLACK", bg: "#4A154B" },
  notion: { label: "NOTION", bg: "#000000" },
  google_calendar: { label: "CALENDAR", bg: "#4285F4" },
  gmail: { label: "EMAIL", bg: "#EA4335" },
  granola: { label: "GRANOLA", bg: "#F5A623" },
};

function formatTimestamp(ts?: string): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (isNaN(date.getTime())) return ts;
  const now = Date.now();
  const diffH = Math.round((now - date.getTime()) / 3_600_000);

  if (diffH < 0) {
    // Future event
    const diffAbs = Math.abs(diffH);
    if (diffAbs < 1) return "soon";
    if (diffAbs < 24) return `in ${diffAbs}h`;
    const diffD = Math.round(diffAbs / 24);
    return `in ${diffD}d`;
  }
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

function SourceBadge({ source }: { source: SearchSource }) {
  const badge = SOURCE_BADGES[source];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 5px",
        borderRadius: 3,
        fontSize: "0.65rem",
        fontWeight: 700,
        color: "var(--accent)",
        background: badge.bg,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        flexShrink: 0,
        lineHeight: "1.4",
      }}
    >
      {badge.label}
    </span>
  );
}

function LiveBadge() {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 4px",
        borderRadius: 3,
        fontSize: "0.65rem",
        fontWeight: 600,
        color: "var(--green)",
        background: "color-mix(in srgb, var(--green) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--green) 25%, transparent)",
        flexShrink: 0,
        lineHeight: "1.4",
      }}
    >
      LIVE
    </span>
  );
}

export function CommandPalette({
  data,
  onSelect,
  onClose,
}: {
  data: DatasourceData;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [liveResults, setLiveResults] = useState<SearchResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  // Debounce query at 200ms for client-side
  const updateDebouncedQuery = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setDebouncedQuery("");
      return;
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q);
    }, 200);
  }, []);

  // Live search: debounce at 500ms, then hit the API
  const triggerLiveSearch = useCallback((q: string) => {
    if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
    if (liveAbortRef.current) liveAbortRef.current.abort();

    if (!q.trim()) {
      setLiveResults([]);
      setLiveLoading(false);
      return;
    }

    setLiveLoading(true);
    liveDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      liveAbortRef.current = controller;

      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&live=1`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        if (!controller.signal.aborted) {
          setLiveResults(data.results || []);
        }
      } catch {
        // Aborted or failed — ignore
      } finally {
        if (!controller.signal.aborted) {
          setLiveLoading(false);
        }
      }
    }, 500);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (liveDebounceRef.current) clearTimeout(liveDebounceRef.current);
      if (liveAbortRef.current) liveAbortRef.current.abort();
    };
  }, []);

  // Client-side search — runs synchronously on debounced query
  const cachedResults = useMemo(() => {
    if (!debouncedQuery.trim()) return [];
    return unifiedSearch(debouncedQuery, data);
  }, [debouncedQuery, data]);

  // Merge: cached first, then live results that aren't already shown
  const results = useMemo(() => {
    const seen = new Set(
      cachedResults.map((r) => `${r.source}:${r.title.toLowerCase().trim()}`),
    );
    const newLive = liveResults.filter((r) => {
      const key = `${r.source}:${r.title.toLowerCase().trim()}`;
      return !seen.has(key);
    });
    return [...cachedResults, ...newLive];
  }, [cachedResults, liveResults]);

  // Track which IDs are live-only for badge display
  const liveOnlyIds = useMemo(() => {
    const cachedKeys = new Set(
      cachedResults.map((r) => `${r.source}:${r.title.toLowerCase().trim()}`),
    );
    return new Set(
      liveResults
        .filter((r) => !cachedKeys.has(`${r.source}:${r.title.toLowerCase().trim()}`))
        .map((r) => r.id),
    );
  }, [cachedResults, liveResults]);

  // Reset selection when results change
  useEffect(() => {
    setSelected(0);
  }, [results.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-result-item]");
    const item = items[selected];
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    updateDebouncedQuery(val);
    triggerLiveSearch(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((p) => Math.min(p + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const result = results[selected];
      if (result) {
        if (e.shiftKey && result.url) {
          window.open(result.url, "_blank");
        } else {
          onSelect(result);
        }
        onClose();
      }
    }
  };

  // Group results by source for display
  const groupedResults = useMemo(() => {
    const groups: { source: SearchSource; items: { result: SearchResult; globalIndex: number }[] }[] = [];
    const sourceOrder: SearchSource[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!sourceOrder.includes(result.source)) {
        sourceOrder.push(result.source);
        groups.push({ source: result.source, items: [] });
      }
      const group = groups.find((g) => g.source === result.source)!;
      group.items.push({ result, globalIndex: i });
    }

    return groups;
  }, [results]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "92vw",
          background: "var(--surface)",
          border: "1px solid var(--border-light)",
          borderRadius: 10,
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          overflow: "hidden",
          alignSelf: "flex-start",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: "0.6rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            &#9906;
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search across all sources..."
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              fontSize: "0.75rem",
              color: "var(--text)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          {liveLoading && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                flexShrink: 0,
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            >
              searching...
            </span>
          )}
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              background: "var(--bg)",
              padding: "2px 5px",
              borderRadius: 3,
              border: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            ESC
          </span>
        </div>

        {/* Results list */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto" }}>
          {/* Empty state — no query */}
          {!query.trim() && (
            <div
              style={{
                padding: "1.2rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              <div style={{ marginBottom: "0.4rem" }}>
                Type to search across Calendar, Email, Slack, Linear, GitHub, Notion, and Granola
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>
                Tip: use <span style={{ color: "var(--blue)" }}>in:slack</span>,{" "}
                <span style={{ color: "var(--blue)" }}>in:linear</span>,{" "}
                <span style={{ color: "var(--blue)" }}>in:github</span> to filter by source
              </div>
            </div>
          )}

          {/* No results */}
          {query.trim() && debouncedQuery.trim() && results.length === 0 && !liveLoading && (
            <div
              style={{
                padding: "1.2rem",
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              <div>No results found</div>
              {!data.calendar?.length && !data.linearIssues?.length && !data.githubPRs?.length && !data.slackMessages?.length && !data.notionPages?.length && !data.granolaMeetings?.length && (
                <div style={{ marginTop: "0.4rem", fontSize: "0.68rem", color: "var(--text-dim)" }}>
                  No datasources connected yet. Go to Settings to connect Slack, Linear, GitHub, and more.
                </div>
              )}
            </div>
          )}

          {/* Grouped results */}
          {groupedResults.map((group) => (
            <div key={group.source}>
              {/* Source group header */}
              <div
                style={{
                  padding: "0.3rem 0.6rem 0.15rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                <SourceBadge source={group.source} />
                <span
                  style={{
                    fontSize: "0.65rem",
                    color: "var(--text-dim)",
                  }}
                >
                  {group.items.length} result{group.items.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Results in this group */}
              {group.items.map(({ result, globalIndex }) => (
                <button
                  key={result.id}
                  data-result-item
                  onClick={(e) => {
                    if (e.shiftKey && result.url) {
                      window.open(result.url, "_blank");
                    } else {
                      onSelect(result);
                    }
                    onClose();
                  }}
                  onMouseEnter={() => setSelected(globalIndex)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem 0.4rem 1.2rem",
                    background:
                      globalIndex === selected
                        ? "color-mix(in srgb, var(--text) 6%, transparent)"
                        : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  {/* Title + snippet */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {result.title}
                      </span>
                      {liveOnlyIds.has(result.id) && <LiveBadge />}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-dim)",
                        marginTop: "0.1rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {result.snippet}
                    </div>
                  </div>

                  {/* Timestamp */}
                  {result.timestamp && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        paddingTop: "0.15rem",
                      }}
                    >
                      {formatTimestamp(result.timestamp)}
                    </div>
                  )}

                  {/* Arrow indicator for selected */}
                  {globalIndex === selected && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                        paddingTop: "0.1rem",
                      }}
                    >
                      &#x23CE;
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hints */}
        {(results.length > 0 || liveLoading) && (
          <div
            style={{
              padding: "0.35rem 0.6rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              gap: "0.8rem",
              fontSize: "0.65rem",
              color: "var(--text-muted)",
            }}
          >
            <span>
              <span style={{ color: "var(--text-dim)" }}>&#x2191;&#x2193;</span> navigate
            </span>
            <span>
              <span style={{ color: "var(--text-dim)" }}>&#x23CE;</span> open
            </span>
            <span>
              <span style={{ color: "var(--text-dim)" }}>shift+&#x23CE;</span> open URL
            </span>
            <span>
              <span style={{ color: "var(--text-dim)" }}>esc</span> close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
