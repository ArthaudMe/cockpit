"use client";

import { useState, useEffect } from "react";
import type { Context } from "@/lib/context-client";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { Memory, MemoryStats } from "@/lib/memory/types";

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
      <div className="panel-header" onClick={() => setOpen(!open)}>
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

function ConnectPrompt({
  service,
  label,
  onConnect,
}: {
  service: string;
  label: string;
  onConnect: () => void;
}) {
  return (
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
      <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
        {label}
      </span>
      <button
        onClick={onConnect}
        style={{
          background: "none",
          border: "1px solid var(--accent)",
          borderRadius: 4,
          color: "var(--accent)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "0.5rem",
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
        Connect {service}
      </button>
    </div>
  );
}

export function ContextColumn({
  context,
  onPrefill,
  onCalendarClick,
  onMetricClick,
  onSlackClick,
  onCompetitorClick,
  onTodoClick,
  onSettingsClick,
}: {
  context: Context;
  onPrefill: (text: string) => void;
  onCalendarClick?: (index: number) => void;
  onMetricClick?: (key: string) => void;
  onSlackClick?: (index: number) => void;
  onCompetitorClick?: (index: number) => void;
  onTodoClick?: (index: number) => void;
  onSettingsClick?: () => void;
}) {
  const [todos, setTodos] = usePersistedState("cockpit-todos", context.todos);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);

  const toggleTodo = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setTodos((prev) =>
      prev.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
    );
  };

  // Fetch memories periodically
  useEffect(() => {
    const fetchMemories = async () => {
      try {
        const res = await fetch("/api/memory");
        if (res.ok) {
          const data = await res.json();
          setMemories(data.memories || []);
          setMemoryStats(data.stats || null);
        }
      } catch {
        // silently fail
      }
    };
    fetchMemories();
    const interval = setInterval(fetchMemories, 30_000);
    return () => clearInterval(interval);
  }, []);

  const deleteMemory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silently fail
    }
  };

  const CATEGORY_COLORS: Record<string, string> = {
    personal: "var(--accent)",
    projects: "var(--green)",
    decisions: "var(--yellow)",
    people: "#a78bfa",
    preferences: "#f472b6",
    temporal: "#60a5fa",
    knowledge: "#f97316",
  };

  return (
    <div>
      {/* Calendar */}
      <Panel title="Calendar" count={context.calendar.length} defaultOpen>
        {context.calendar.length === 0 ? (
          context.connected.google ? (
            <div className="empty-state">No upcoming events</div>
          ) : (
            <ConnectPrompt
              service="Google"
              label="Connect Google to see your calendar events"
              onConnect={() => onSettingsClick?.()}
            />
          )
        ) : (() => {
          // Group events by date
          const groups: Record<string, typeof context.calendar> = {};
          for (const m of context.calendar) {
            const key = m.date || "unknown";
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
          }
          const DAY_COLORS = ["var(--accent)", "var(--green)", "var(--yellow)", "#a78bfa", "#f472b6", "#60a5fa", "#f97316"];
          const sortedDates = Object.keys(groups).sort();

          return sortedDates.map((dateStr, di) => {
            const events = groups[dateStr];
            const date = dateStr !== "unknown" ? new Date(dateStr + "T12:00:00") : null;
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            const todayStr = today.toISOString().split("T")[0];
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split("T")[0];
            const isToday = dateStr === todayStr;
            const isTomorrow = dateStr === tomorrowStr;
            const dayLabel = !date ? "Upcoming" : isToday ? "Today" : isTomorrow ? "Tomorrow" : date.toLocaleDateString("en-US", { weekday: "long" });
            const dateLabel = date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
            const color = DAY_COLORS[di % DAY_COLORS.length];

            return (
              <div key={dateStr}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.3rem 0",
                  marginTop: di > 0 ? "0.25rem" : 0,
                }}>
                  <span style={{
                    fontSize: "0.45rem",
                    fontWeight: 700,
                    color: color,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    {dayLabel}
                  </span>
                  <span style={{ fontSize: "0.4rem", color: "var(--text-muted)" }}>
                    {dateLabel}
                  </span>
                  <div style={{ flex: 1, height: 1, background: color, opacity: 0.2 }} />
                </div>
                {events.map((m, i) => {
                  const globalIndex = context.calendar.indexOf(m);
                  return (
                    <div
                      key={i}
                      className="feed-item"
                      onClick={() => onCalendarClick ? onCalendarClick(globalIndex) : onPrefill(`Prep me for the ${m.title} — what should I know?`)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span className="feed-title">{m.title}</span>
                        <span className="feed-time">{m.duration}</span>
                      </div>
                      <div className="feed-meta">
                        <span style={{ fontSize: "0.6rem", color }}>{m.time}</span>
                        <span className="feed-time">{m.attendees.join(", ")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          });
        })()}
      </Panel>

      {/* Usage Analytics — only shown when data exists */}
      {Object.keys(context.usage_analytics).length > 0 && (
      <Panel title="Metrics" count={Object.keys(context.usage_analytics).length} defaultOpen>
        {(
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
            {Object.entries(context.usage_analytics).map(([key, v]) => {
              const label = key.toUpperCase();
              const isNegativeChange = v.change.startsWith("-") && !v.change.startsWith("-0");
              const isGood = key === "churn" ? isNegativeChange : !isNegativeChange;

              return (
                <div
                  key={key}
                  className="feed-item"
                  onClick={() => onMetricClick ? onMetricClick(key) : onPrefill(`${label} is ${v.change} over the last ${v.period}. What's driving that?`)}
                  style={{
                    padding: "0.4rem",
                    borderBottom: "none",
                    background: "rgba(255,255,255,0.02)",
                    borderRadius: 3,
                  }}
                >
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">
                    {key === "mrr" ? `$${v.value.toLocaleString()}` : `${v.value}${"unit" in v ? v.unit : ""}`}
                  </div>
                  <div className={`metric-change ${isGood ? "positive" : "negative"}`}>
                    {v.change}
                    <span style={{ color: "var(--text-muted)" }}> / {v.period}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      )}

      {/* Slack */}
      <Panel title="Slack" count={context.slack_highlights.length}>
        {context.slack_highlights.length === 0 ? (
          context.connected.slack ? (
            <div className="empty-state">No recent messages</div>
          ) : (
            <ConnectPrompt
              service="Slack"
              label="Connect Slack to see your team's messages"
              onConnect={() => onSettingsClick?.()}
            />
          )
        ) : context.slack_highlights.map((h, i) => (
          <div
            key={i}
            className="feed-item"
            onClick={() => onSlackClick ? onSlackClick(i) : onPrefill(`Tell me more about: ${h.message.split("—")[0]?.trim() || h.message.slice(0, 40)}`)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="feed-source">{h.channel}</span>
              <span className="feed-time">{h.time}</span>
            </div>
            <div className="feed-title">{h.message}</div>
          </div>
        ))}
      </Panel>

      {/* Competitors — only shown when data exists */}
      {context.competitor_updates.length > 0 && (
      <Panel title="Competitors" count={context.competitor_updates.length}>
        {context.competitor_updates.map((u, i) => (
          <div
            key={i}
            className="feed-item"
            onClick={() => onCompetitorClick ? onCompetitorClick(i) : onPrefill(`${u.competitor} is ${u.event.toLowerCase()}. What does that mean for us?`)}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text)" }}>
                {u.competitor}
              </span>
              <div className="feed-meta">
                <span className="tag tag-dim">{u.source}</span>
                <span className="feed-time">{u.time}</span>
              </div>
            </div>
            <div className="feed-title">{u.event}</div>
          </div>
        ))}
      </Panel>
      )}

      {/* Todo */}
      <Panel title="Todo" count={todos.length > 0 ? todos.filter((t) => !t.done).length + "/" + todos.length : 0}>
        {todos.length === 0 ? (
          <div className="empty-state">No todos yet</div>
        ) : todos.map((t, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.25rem 0",
              cursor: "pointer",
            }}
            onClick={() => onTodoClick ? onTodoClick(i) : onPrefill(`Help me with: ${t.text}`)}
          >
            <div
              className={`checkbox ${t.done ? "checked" : ""}`}
              onClick={(e) => toggleTodo(e, i)}
            >
              {t.done ? "✓" : ""}
            </div>
            <span
              style={{
                fontSize: "0.6rem",
                color: t.done ? "var(--text-muted)" : "var(--text)",
                textDecoration: t.done ? "line-through" : "none",
                lineHeight: 1.3,
              }}
            >
              {t.text}
            </span>
          </div>
        ))}
      </Panel>

      {/* Memory — ASMR-powered long-term memory */}
      <Panel title="Memory" count={memories.length} defaultOpen={false}>
        {memories.length === 0 ? (
          <div className="empty-state">
            No memories yet — they build up as you chat
          </div>
        ) : (
          <>
            {memories.slice(-10).reverse().map((m) => (
              <div
                key={m.id}
                className="feed-item"
                onClick={() => onPrefill(`Based on what you remember about me, ${m.content.toLowerCase().startsWith("i") ? "" : "regarding "}${m.content.slice(0, 60).toLowerCase()}...`)}
                style={{ position: "relative" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    className="tag"
                    style={{
                      fontSize: "0.4rem",
                      color: CATEGORY_COLORS[m.category] || "var(--text-muted)",
                      borderColor: CATEGORY_COLORS[m.category] || "var(--text-muted)",
                    }}
                  >
                    {m.category}
                  </span>
                  <button
                    onClick={(e) => deleteMemory(e, m.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: "0.5rem",
                      padding: "0 0.2rem",
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--red, #ef4444)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = "var(--text-muted)"; }}
                    title="Forget this memory"
                  >
                    x
                  </button>
                </div>
                <div className="feed-title" style={{ fontSize: "0.55rem" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {memoryStats && (
              <div style={{ fontSize: "0.4rem", color: "var(--text-muted)", padding: "0.3rem 0", textAlign: "center" }}>
                {memoryStats.total} memories across {Object.entries(memoryStats.byCategory).filter(([, v]) => v > 0).length} categories
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
