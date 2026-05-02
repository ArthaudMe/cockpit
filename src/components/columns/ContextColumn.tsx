"use client";

import { useState, useEffect } from "react";
import type { Context } from "@/lib/context-client";
import { usePersistedState } from "@/lib/use-persisted-state";
import { track } from "@/lib/analytics";

type QuickSkill = {
  id: string;
  name: string;
  slash: string;
  icon: string;
  custom?: boolean;
};

const FEATURED_SKILLS: QuickSkill[] = [
  { id: "data-analyst", name: "Analyst", slash: "/data", icon: "▥" },
  { id: "product-manager", name: "PM", slash: "/pm", icon: "◧" },
  { id: "sales-pipeline", name: "Sales", slash: "/sales", icon: "◆" },
  { id: "eng-manager", name: "Admin", slash: "/eng", icon: "◫" },
  { id: "builder", name: "Finance", slash: "/build", icon: "⚙" },
];

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
      <div className="panel-header" onClick={() => { setOpen(!open); track("panel_clicked", { panel: title }); }}>
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
  onConnectService,
}: {
  context: Context;
  onPrefill: (text: string) => void;
  onCalendarClick?: (index: number) => void;
  onMetricClick?: (key: string) => void;
  onSlackClick?: (index: number) => void;
  onCompetitorClick?: (index: number) => void;
  onTodoClick?: (index: number) => void;
  onSettingsClick?: () => void;
  onConnectService?: (serviceId: string) => void;
}) {
  const [todos, setTodos] = usePersistedState("cockpit-todos", context.todos);

  const toggleTodo = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setTodos((prev) =>
      prev.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
    );
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
              onConnect={() => onConnectService ? onConnectService("google") : onSettingsClick?.()}
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
              onConnect={() => onConnectService ? onConnectService("slack") : onSettingsClick?.()}
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

      {/* Skills */}
      <SkillsPanel onPrefill={onPrefill} />

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

    </div>
  );
}

function SkillsPanel({ onPrefill }: { onPrefill: (text: string) => void }) {
  const [customSkills, setCustomSkills] = useState<QuickSkill[]>([]);

  useEffect(() => {
    fetch("/api/skills/custom")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCustomSkills(
            data.map((s: any) => ({
              id: s.id,
              name: s.name,
              slash: s.slash,
              icon: s.icon || "★",
              custom: true,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const allSkills = [...FEATURED_SKILLS, ...customSkills];

  return (
    <Panel title="Skills" count={allSkills.length}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
        {allSkills.map((skill) => (
          <button
            key={skill.id}
            onClick={() => {
              onPrefill(`${skill.slash} `);
              track("skill_clicked", { skill: skill.id });
            }}
            style={{
              background: skill.custom
                ? "rgba(168,139,250,0.1)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${skill.custom ? "rgba(168,139,250,0.3)" : "var(--border)"}`,
              borderRadius: 4,
              color: skill.custom ? "#a78bfa" : "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.5rem",
              padding: "0.2rem 0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              transition: "all 0.15s",
            }}
            title={`${skill.slash} — Click to use`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = skill.custom
                ? "rgba(168,139,250,0.2)"
                : "rgba(255,255,255,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = skill.custom
                ? "rgba(168,139,250,0.1)"
                : "rgba(255,255,255,0.04)";
            }}
          >
            <span>{skill.icon}</span> {skill.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}
