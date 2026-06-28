"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ContextFocus } from "../views/ContextualChatView";
import { compactDisplayText } from "@/lib/compact-text";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { FeedItem } from "@/lib/context-client";

function Panel({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="panel">
      <div className="panel-header" role="button" tabIndex={0} aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); } }}>
        <div className="panel-title-row">
          <span className="panel-title">{title}</span>
          {count !== undefined && <span className="panel-count">{count}</span>}
        </div>
        <span className={`panel-toggle ${open ? "open" : ""}`}>▶</span>
      </div>
      {open && <div className="panel-content">{children}</div>}
    </div>
  );
}

function feedItemToFocus(item: FeedItem): ContextFocus {
  const displayEvent = compactDisplayText(item.event);
  const displayTime = item.timeContext || item.time;
  const absoluteTime = item.occurredAt ? new Date(item.occurredAt).toLocaleString() : undefined;
  return {
    title: displayEvent.length > 50 ? displayEvent.slice(0, 50) + "..." : displayEvent,
    subtitle: `${item.actor} · ${displayTime}${item.project ? ` · ${item.project}` : ""}`,
    source: item.type === "agent" ? "Agent" : item.type === "code" ? "GitHub" : item.type === "sales" ? "Sales" : item.type === "meeting" ? "Calendar" : item.type === "milestone" ? "Linear" : item.type === "data" ? "Data" : "Feed",
    icon: item.icon,
    data: [
      {
        Actor: item.actor,
        Event: item.event,
        ...(item.project ? { Project: item.project } : {}),
        Time: displayTime,
        ...(absoluteTime ? { Occurred: absoluteTime } : {}),
      },
    ],
    suggestedQuestions: item.type === "agent"
      ? ["What did the agent do exactly?", "Show me the details", "Are there any issues?", "What's the agent working on next?"]
      : item.type === "code"
      ? ["Show me the changes", "What does this PR do?", "Are there any risks?", "Who should review this?"]
      : item.type === "sales"
      ? ["Tell me more about this", "What's the next step?", "What's the deal status?", "Draft a follow-up"]
      : item.type === "meeting"
      ? ["Prep me for this", "What context do I need?", "Draft an agenda", "What are the open items?"]
      : ["Tell me more about this", "What's the context?", "What should I do about this?", "How does this affect our plans?"],
    systemContext: `The user is looking at a company feed event: ${item.actor} — "${displayEvent}" (type: ${item.type}, ${displayTime}${item.project ? `, project: ${item.project}` : ""}${absoluteTime ? `, occurred at: ${absoluteTime}` : ""}).${item.detail ? `\n\nFull details:\n${item.detail}` : ""}\n\nHelp them understand and take action. Use the details above to give a specific, informed answer.`,
  };
}

const TYPE_COLOR: Record<string, string> = {
  agent: "var(--accent)",
  code: "var(--green)",
  message: "var(--blue)",
  meeting: "var(--yellow)",
  sales: "var(--yellow)",
  milestone: "var(--green)",
  data: "var(--purple)",
};

export function FeedColumn({
  feed,
  onOpenFocus,
  hasAnyDatasource,
  onSettingsClick,
}: {
  feed: FeedItem[];
  onOpenFocus: (focus: ContextFocus) => void;
  hasAnyDatasource?: boolean;
  onSettingsClick?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [doneIds, setDoneIds] = usePersistedState<string[]>(
    "cockpit-feed-done-ids",
    [],
    {
      serialize: (ids) => Array.from(new Set(ids)).slice(-500),
    },
  );
  const doneIdSet = useMemo(() => new Set(doneIds), [doneIds]);
  const statusFeed = useMemo(
    () => feed.filter((item) => doneIdSet.has(item.id) === showDone),
    [doneIdSet, feed, showDone],
  );
  const filteredFeed = useMemo(
    () => filter ? statusFeed.filter((f) => f.type === filter) : statusFeed,
    [filter, statusFeed],
  );
  const types = useMemo(
    () => Array.from(new Set(statusFeed.map((f) => f.type))),
    [statusFeed],
  );
  const doneCount = useMemo(
    () => feed.filter((item) => doneIdSet.has(item.id)).length,
    [doneIdSet, feed],
  );
  const activeCount = feed.length - doneCount;

  // Show all items immediately (avoids dozens of rapid re-renders)
  useEffect(() => {
    setVisibleCount(filteredFeed.length);
  }, [filteredFeed.length]);

  useEffect(() => {
    if (filter && !types.includes(filter)) {
      setFilter(null);
    }
  }, [filter, types]);

  const toggleDone = useCallback(
    (id: string) => {
      setDoneIds((prev) => {
        if (prev.includes(id)) return prev.filter((existing) => existing !== id);
        return [...prev, id].slice(-500);
      });
    },
    [setDoneIds],
  );

  if (feed.length === 0 && !hasAnyDatasource) {
    return (
      <Panel title="Live Feed" count={0}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.75rem 0.5rem",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
            Connect your tools to see live activity from your team
          </span>
          <button
            onClick={() => onSettingsClick?.()}
            style={{
              background: "none",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              color: "var(--accent)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              padding: "0.25rem 0.6rem",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.color = "var(--bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
              e.currentTarget.style.color = "var(--accent)";
            }}
          >
            Connect datasources
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Live Feed" count={showDone ? `${doneCount} done` : activeCount}>
      {/* Filter chips */}
      {feed.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", marginBottom: "0.4rem" }}>
        <button
          onClick={() => {
            setShowDone(false);
            setFilter(null);
          }}
          className={`tag ${!showDone ? "tag-green" : "tag-dim"}`}
          style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
        >
          Open
        </button>
        {doneCount > 0 && (
          <button
            onClick={() => {
              setShowDone(true);
              setFilter(null);
            }}
            className={`tag ${showDone ? "tag-green" : "tag-dim"}`}
            style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
          >
            Done {doneCount}
          </button>
        )}
        <button
          onClick={() => setFilter(null)}
          className={`tag ${!filter ? "tag-green" : "tag-dim"}`}
          style={{ cursor: "pointer", border: "none", fontFamily: "inherit" }}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(filter === t ? null : t)}
            className={`tag ${filter === t ? "tag-green" : "tag-dim"}`}
            style={{ cursor: "pointer", border: "none", fontFamily: "inherit", textTransform: "capitalize" }}
          >
            {t}
          </button>
        ))}
      </div>
      )}

      {/* Feed items */}
      {filteredFeed.length === 0 ? (
        <div className="empty-state">
          {showDone
            ? "No done feed items"
            : doneCount > 0
              ? "Feed is clear. Done items are hidden."
              : "No live feed items yet."}
        </div>
      ) : filteredFeed.map((item, i) => {
        const isDone = doneIdSet.has(item.id);
        const displayTime = item.timeContext || item.time;
        return (
        <div
          key={item.id}
          className="feed-item"
          onClick={() => onOpenFocus(feedItemToFocus(item))}
          style={{
            opacity: i < visibleCount ? (isDone ? 0.55 : 1) : 0,
            transform: i < visibleCount ? "translateY(0)" : "translateY(4px)",
            transition: "opacity 0.3s ease, transform 0.3s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", flexShrink: 0, lineHeight: 1.4 }}>{item.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: TYPE_COLOR[item.type] || "var(--text)" }}>
                  {item.actor}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexShrink: 0 }}>
                  <span className="feed-time" title={item.time}>{displayTime}</span>
                  <button
                    className={`checkbox ${isDone ? "checked" : ""}`}
                    type="button"
                    aria-label={isDone ? "Mark feed item as open" : "Mark feed item as done"}
                    title={isDone ? "Mark as open" : "Mark as done"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDone(item.id);
                    }}
                    style={{
                      background: isDone ? "color-mix(in srgb, var(--green) 10%, transparent)" : "transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isDone ? "✓" : ""}
                  </button>
                </div>
              </div>
              <div className="feed-title">{compactDisplayText(item.event)}</div>
              {item.project && (
                <span className="tag tag-dim" style={{ marginTop: "0.15rem" }}>
                  {item.project}
                </span>
              )}
            </div>
          </div>
        </div>
        );
      })}

      {/* Live indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.35rem 0",
          borderTop: "1px solid var(--border)",
          marginTop: "0.3rem",
        }}
      >
        <span
          className="dot"
          style={{
            background: "var(--green)",
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Live — updates automatically
        </span>
      </div>
    </Panel>
  );
}
