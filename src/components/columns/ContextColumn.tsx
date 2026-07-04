"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Context } from "@/lib/context-client";
import type { SuggestedTodo } from "@/lib/todos/infer";
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
  onAdd,
  children,
}: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  onAdd?: () => void;
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {onAdd && (
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.75rem",
                padding: "0 0.2rem",
                lineHeight: 1,
              }}
              title="Add item"
            >
              +
            </button>
          )}
          <span className={`panel-toggle ${open ? "open" : ""}`}>▶</span>
        </div>
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
  onTodoFocus,
  onSettingsClick,
  onConnectService,
  suggestedTodos,
}: {
  context: Context;
  onPrefill: (text: string) => void;
  onCalendarClick?: (index: number) => void;
  onMetricClick?: (key: string) => void;
  onCompetitorClick?: (index: number) => void;
  onTodoFocus?: (todo: { text: string; done: boolean }) => void;
  onSettingsClick?: () => void;
  onConnectService?: (serviceId: string) => void;
  suggestedTodos?: SuggestedTodo[];
}) {
  const [todos, setTodos] = usePersistedState("cockpit-todos", context.todos);
  const [dismissedSuggestions, setDismissedSuggestions] = usePersistedState<string[]>("cockpit-dismissed-suggestions", []);
  const [futureCalendarOpen, setFutureCalendarOpen] = useState(false);
  const [showCreateTodo, setShowCreateTodo] = useState(false);
  const [createTodoText, setCreateTodoText] = useState("");
  const createTodoRef = useRef<HTMLInputElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (showCreateTodo) setTimeout(() => createTodoRef.current?.focus(), 0);
  }, [showCreateTodo]);

  const handleCreateTodo = useCallback(() => {
    const text = createTodoText.trim();
    if (text) {
      setTodos((prev) => [...prev, { text, done: false }]);
      track("todo_created", { source: "manual" });
    }
    setCreateTodoText("");
    setShowCreateTodo(false);
  }, [createTodoText, setTodos]);

  const handleDeleteTodo = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setTodos((prev) => prev.filter((_, i) => i !== index));
  }, [setTodos]);

  const toggleTodo = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setTodos((prev) =>
      prev.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
    );
  };

  // Suggested todos — filter out dismissed and already-accepted ones
  const visibleSuggestions = (suggestedTodos || []).filter(
    (s) => !dismissedSuggestions.includes(s.id) && !todos.some((t) => t.text === s.text)
  );

  const acceptSuggestion = useCallback((suggestion: SuggestedTodo) => {
    setTodos((prev) => [...prev, { text: suggestion.text, done: false }]);
    track("todo_created", { source: "suggested", suggestionSource: suggestion.source });
    if (suggestion.url) {
      window.open(suggestion.url, "_blank");
    }
  }, [setTodos]);

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedSuggestions((prev) => [...prev, id]);
  }, [setDismissedSuggestions]);

  // Drag-and-drop reordering
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setTodos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, setTodos]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

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
      <Panel
        title="Todo"
        count={todos.length > 0 ? todos.filter((t) => !t.done).length + "/" + todos.length : 0}
        onAdd={() => setShowCreateTodo(true)}
      >
        {/* Existing todos with drag-and-drop */}
        {todos.length === 0 && visibleSuggestions.length === 0 && !showCreateTodo && (
          <div className="empty-state">No todos yet — click + to add one</div>
        )}
        {todos.map((t, i) => (
          <div
            key={i}
            className="todo-row"
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={() => handleDrop(i)}
            onDragEnd={handleDragEnd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.25rem 0",
              cursor: "pointer",
              opacity: dragIndex === i ? 0.4 : 1,
              borderTop: dragOverIndex === i && dragIndex !== null && dragIndex !== i
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              transition: "opacity 0.15s",
            }}
            onClick={() => onTodoFocus ? onTodoFocus(t) : onPrefill(`Help me with: ${t.text}`)}
          >
            <span
              style={{
                cursor: "grab",
                color: "var(--text-muted)",
                fontSize: "0.6rem",
                flexShrink: 0,
                userSelect: "none",
                opacity: 0.5,
                lineHeight: 1,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              ⠿
            </span>
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
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {t.text}
            </span>
            <button
              onClick={(e) => handleDeleteTodo(e, i)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.75rem",
                padding: "0 0.15rem",
                opacity: 0,
                transition: "opacity 0.1s",
                flexShrink: 0,
              }}
              className="todo-delete"
              title="Remove todo"
            >
              &times;
            </button>
          </div>
        ))}

        {/* Inline create todo */}
        {showCreateTodo && (
          <div style={{ padding: "0.25rem 0" }}>
            <input
              ref={createTodoRef}
              value={createTodoText}
              onChange={(e) => setCreateTodoText(e.target.value)}
              onBlur={handleCreateTodo}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTodo();
                if (e.key === "Escape") { setCreateTodoText(""); setShowCreateTodo(false); }
              }}
              placeholder="What needs to be done?"
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border-light)",
                borderRadius: 3,
                padding: "0.3rem 0.4rem",
                fontSize: "0.75rem",
                color: "var(--text)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
        )}

        {/* Suggested todos from datasources */}
        {visibleSuggestions.length > 0 && (
          <div style={{ marginTop: todos.length > 0 ? "0.4rem" : 0 }}>
            <div style={{
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "0.2rem 0",
              borderTop: todos.length > 0 ? "1px solid var(--border)" : "none",
            }}>
              Suggested
            </div>
            {visibleSuggestions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.2rem 0",
                  fontSize: "0.75rem",
                }}
              >
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  color: "var(--text-dim)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}>
                  {s.text}
                </span>
                <span className="tag tag-dim" style={{ flexShrink: 0 }}>{s.source}</span>
                <button
                  onClick={() => acceptSuggestion(s)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--green)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.7rem",
                    padding: "0 0.15rem",
                    flexShrink: 0,
                  }}
                  title="Accept"
                >
                  ✓
                </button>
                <button
                  onClick={() => dismissSuggestion(s.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.7rem",
                    padding: "0 0.15rem",
                    flexShrink: 0,
                  }}
                  title="Dismiss"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
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
