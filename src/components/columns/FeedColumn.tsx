"use client";

import { useState, useEffect } from "react";
import type { ContextFocus } from "../views/ContextualChatView";

type FeedItem = {
  type: string;
  actor: string;
  event: string;
  project: string | null;
  time: string;
  icon: string;
  detail?: string;
};

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
  return {
    title: item.event.length > 50 ? item.event.slice(0, 50) + "..." : item.event,
    subtitle: `${item.actor} · ${item.time}${item.project ? ` · ${item.project}` : ""}`,
    source: item.type === "agent" ? "Agent" : item.type === "code" ? "GitHub" : item.type === "sales" ? "Sales" : item.type === "meeting" ? "Calendar" : item.type === "milestone" ? "Linear" : "Feed",
    icon: item.icon,
    data: [
      { Actor: item.actor, Event: item.event, ...(item.project ? { Project: item.project } : {}), Time: item.time },
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
    systemContext: `The user is looking at a company feed event: ${item.actor} — "${item.event}" (type: ${item.type}, ${item.time}${item.project ? `, project: ${item.project}` : ""}).${item.detail ? `\n\nFull details:\n${item.detail}` : ""}\n\nHelp them understand and take action. Use the details above to give a specific, informed answer.`,
  };
}

const TYPE_COLOR: Record<string, string> = {
  agent: "var(--accent)",
  code: "var(--green)",
  message: "var(--blue)",
  meeting: "var(--yellow)",
  sales: "var(--yellow)",
  milestone: "var(--green)",
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

  // Show all items immediately (avoids dozens of rapid re-renders)
  useEffect(() => {
    setVisibleCount(feed.length);
  }, [feed.length]);

  const filteredFeed = filter ? feed.filter((f) => f.type === filter) : feed;
  const types = Array.from(new Set(feed.map((f) => f.type)));

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
    <Panel title="Live Feed" count={feed.length}>
      {/* Filter chips */}
      {feed.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", marginBottom: "0.4rem" }}>
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
      {filteredFeed.map((item, i) => (
        <div
          key={i}
          className="feed-item"
          onClick={() => onOpenFocus(feedItemToFocus(item))}
          style={{
            opacity: i < visibleCount ? 1 : 0,
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
                <span className="feed-time">{item.time}</span>
              </div>
              <div className="feed-title">{item.event}</div>
              {item.project && (
                <span className="tag tag-dim" style={{ marginTop: "0.15rem" }}>
                  {item.project}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

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
