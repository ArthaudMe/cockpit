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
      <div className="panel-header" role="button" tabIndex={0} aria-expanded={open} onClick={() => { setOpen(!open); track("panel_clicked", { panel: title }); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!open); track("panel_clicked", { panel: title }); } }}>
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
      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
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
        Connect {service}
      </button>
    </div>
  );
}

type CalendarItem = Context["calendar"][number];
type IndexedCalendarItem = { event: CalendarItem; index: number };

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCalendarTime(event: CalendarItem): number {
  if (!event.date) return Number.MAX_SAFE_INTEGER;
  const [year, month, day] = event.date.split("-").map(Number);
  const match = event.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
}

function dateLabel(dateStr: string, todayStr: string, tomorrowStr: string): { day: string; date: string } {
  if (dateStr === "unknown") return { day: "Upcoming", date: "" };
  const date = new Date(dateStr + "T12:00:00");
  const day =
    dateStr === todayStr
      ? "Today"
      : dateStr === tomorrowStr
        ? "Tomorrow"
        : date.toLocaleDateString("en-US", { weekday: "long" });
  return {
    day,
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

function CalendarEventRow({
  item,
  color,
  onClick,
}: {
  item: IndexedCalendarItem;
  color: string;
  onClick: (item: IndexedCalendarItem) => void;
}) {
  const { event } = item;
  return (
    <div
      className="feed-item"
      onClick={() => onClick(item)}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.35rem" }}>
        <span className="feed-title">{event.title}</span>
        <span className="feed-time">{event.duration}</span>
      </div>
      <div className="feed-meta">
        <span style={{ fontSize: "0.75rem", color }}>{event.time}</span>
        <span className="feed-time">{event.attendees?.length ? event.attendees.join(", ") : "Just you"}</span>
      </div>
    </div>
  );
}

function CalendarDayGroup({
  dateStr,
  items,
  color,
  todayStr,
  tomorrowStr,
  onEventClick,
}: {
  dateStr: string;
  items: IndexedCalendarItem[];
  color: string;
  todayStr: string;
  tomorrowStr: string;
  onEventClick: (item: IndexedCalendarItem) => void;
}) {
  const label = dateLabel(dateStr, todayStr, tomorrowStr);

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.3rem 0",
      }}>
        <span style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {label.day}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {label.date}
        </span>
        <div style={{ flex: 1, height: 1, background: color, opacity: 0.2 }} />
      </div>
      {items.map((item) => (
        <CalendarEventRow
          key={`${item.index}-${item.event.date}-${item.event.time}-${item.event.title}`}
          item={item}
          color={color}
          onClick={onEventClick}
        />
      ))}
    </div>
  );
}

function CalendarAgenda({
  events,
  futureOpen,
  onToggleFuture,
  onCalendarClick,
  onPrefill,
}: {
  events: CalendarItem[];
  futureOpen: boolean;
  onToggleFuture: () => void;
  onCalendarClick?: (index: number) => void;
  onPrefill: (text: string) => void;
}) {
  const today = new Date();
  const todayStr = localDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = localDateKey(tomorrow);
  const DAY_COLORS = ["var(--accent)", "var(--green)", "var(--yellow)", "var(--purple)", "var(--pink)", "var(--blue)", "var(--orange)"];
  const grouped = new Map<string, IndexedCalendarItem[]>();

  events.forEach((event, index) => {
    const key = event.date || "unknown";
    const items = grouped.get(key) || [];
    items.push({ event, index });
    grouped.set(key, items);
  });

  for (const items of grouped.values()) {
    items.sort((a, b) => parseCalendarTime(a.event) - parseCalendarTime(b.event));
  }

  const todayItems = grouped.get(todayStr) || [];
  const futureDates = [...grouped.keys()]
    .filter((dateStr) => dateStr === "unknown" || dateStr > todayStr)
    .sort((a, b) => a.localeCompare(b));
  const futureCount = futureDates.reduce((sum, dateStr) => sum + (grouped.get(dateStr)?.length || 0), 0);
  const nextFuture = futureDates.flatMap((dateStr) => grouped.get(dateStr) || [])[0];
  const nextLabel = nextFuture
    ? `${dateLabel(nextFuture.event.date || "unknown", todayStr, tomorrowStr).day} ${nextFuture.event.time}`
    : "";

  const handleClick = (item: IndexedCalendarItem) => {
    if (onCalendarClick) onCalendarClick(item.index);
    else onPrefill(`Prep me for the ${item.event.title} — what should I know?`);
  };

  return (
    <div>
      {todayItems.length > 0 ? (
        <CalendarDayGroup
          dateStr={todayStr}
          items={todayItems}
          color={DAY_COLORS[0]}
          todayStr={todayStr}
          tomorrowStr={tomorrowStr}
          onEventClick={handleClick}
        />
      ) : (
        <div style={{
          fontSize: "0.68rem",
          color: "var(--text-muted)",
          padding: "0.35rem 0 0.45rem",
          borderBottom: futureCount > 0 ? "1px solid var(--border)" : "none",
        }}>
          No more events today
        </div>
      )}

      {futureCount > 0 && (
        <div style={{ paddingTop: "0.35rem" }}>
          <button
            type="button"
            onClick={onToggleFuture}
            style={{
              width: "100%",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.68rem",
              padding: "0.25rem 0.35rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.4rem",
            }}
          >
            <span>{futureOpen ? "Hide future days" : `Future days (${futureCount})`}</span>
            <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {nextLabel}
            </span>
          </button>
          {futureOpen && (
            <div style={{ maxHeight: "14rem", overflowY: "auto", paddingRight: "0.15rem", marginTop: "0.35rem" }}>
              {futureDates.map((dateStr, i) => (
                <CalendarDayGroup
                  key={dateStr}
                  dateStr={dateStr}
                  items={grouped.get(dateStr) || []}
                  color={DAY_COLORS[(i + 1) % DAY_COLORS.length]}
                  todayStr={todayStr}
                  tomorrowStr={tomorrowStr}
                  onEventClick={handleClick}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContextColumn({
  context,
  onPrefill,
  onCalendarClick,
  onMetricClick,
  onCompetitorClick,
  onTodoClick,
  onSettingsClick,
  onConnectService,
}: {
  context: Context;
  onPrefill: (text: string) => void;
  onCalendarClick?: (index: number) => void;
  onMetricClick?: (key: string) => void;
  onCompetitorClick?: (index: number) => void;
  onTodoClick?: (index: number) => void;
  onSettingsClick?: () => void;
  onConnectService?: (serviceId: string) => void;
}) {
  const [todos, setTodos] = usePersistedState("cockpit-todos", context.todos);
  const [futureCalendarOpen, setFutureCalendarOpen] = useState(false);

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
            <div className="empty-state">No upcoming events this week</div>
          ) : (
            <ConnectPrompt
              service="Google"
              label="Connect Google to see your calendar events"
              onConnect={() => onConnectService ? onConnectService("google") : onSettingsClick?.()}
            />
          )
        ) : (
          <CalendarAgenda
            events={context.calendar}
            futureOpen={futureCalendarOpen}
            onToggleFuture={() => setFutureCalendarOpen((open) => !open)}
            onCalendarClick={onCalendarClick}
            onPrefill={onPrefill}
          />
        )}
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
                    background: "color-mix(in srgb, var(--text) 2%, transparent)",
                    borderRadius: 3,
                  }}
                >
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">
                    {key === "mrr" ? `$${(v.value ?? 0).toLocaleString()}` : `${v.value ?? 0}${"unit" in v ? v.unit : ""}`}
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
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text)" }}>
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
          <div className="empty-state">No todos yet — ask your AI to create some</div>
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
                fontSize: "0.75rem",
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
  const [skillsError, setSkillsError] = useState(false);

  const loadCustomSkills = () => {
    setSkillsError(false);
    fetch("/api/skills/custom")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
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
      .catch(() => setSkillsError(true));
  };

  useEffect(() => {
    loadCustomSkills();
  }, []);

  const allSkills = [...FEATURED_SKILLS, ...customSkills];

  return (
    <Panel title="Skills" count={allSkills.length}>
      {skillsError && (
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>
          Failed to load custom skills.{" "}
          <span onClick={loadCustomSkills} style={{ color: "var(--blue)", cursor: "pointer" }}>Retry</span>
        </div>
      )}
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
                ? "color-mix(in srgb, var(--purple) 10%, transparent)"
                : "color-mix(in srgb, var(--text) 4%, transparent)",
              border: `1px solid ${skill.custom ? "color-mix(in srgb, var(--purple) 30%, transparent)" : "var(--border)"}`,
              borderRadius: 4,
              color: skill.custom ? "var(--purple)" : "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              padding: "0.2rem 0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              transition: "all 0.15s",
            }}
            title={`${skill.slash} — Click to use`}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = skill.custom
                ? "color-mix(in srgb, var(--purple) 20%, transparent)"
                : "color-mix(in srgb, var(--text) 8%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = skill.custom
                ? "color-mix(in srgb, var(--purple) 10%, transparent)"
                : "color-mix(in srgb, var(--text) 4%, transparent)";
            }}
          >
            <span>{skill.icon}</span> {skill.name}
          </button>
        ))}
      </div>
    </Panel>
  );
}
