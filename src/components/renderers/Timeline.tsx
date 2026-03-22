"use client";

type TimelineEvent = {
  time: string;
  title: string;
  description?: string;
  status?: string;
};

const statusColors: Record<string, string> = {
  done: "#4ade80",
  completed: "#4ade80",
  active: "var(--accent)",
  "in progress": "var(--accent)",
  current: "var(--accent)",
  upcoming: "var(--text-muted)",
  pending: "var(--text-muted)",
  blocked: "#f87171",
  failed: "#f87171",
  overdue: "#f87171",
};

function getStatusColor(status?: string): string {
  if (!status) return "var(--text-muted)";
  return statusColors[status.toLowerCase()] || "var(--text-muted)";
}

export function RenderTimeline({
  title,
  events,
}: {
  title?: string;
  events: TimelineEvent[];
}) {
  return (
    <div
      style={{
        margin: "0.4rem 0",
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {title && (
        <div
          style={{
            padding: "0.35rem 0.5rem",
            fontSize: "0.6rem",
            fontWeight: 600,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ padding: "0.5rem 0.5rem 0.5rem 0.75rem" }}>
        {events.map((e, i) => {
          const color = getStatusColor(e.status);
          const isLast = i === events.length - 1;

          return (
            <div key={i} style={{ display: "flex", gap: "0.6rem", position: "relative" }}>
              {/* Timeline line + dot */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 12, flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 2 }} />
                {!isLast && (
                  <div style={{ width: 1, flex: 1, background: "var(--border)", marginTop: 2, marginBottom: 2 }} />
                )}
              </div>

              {/* Content */}
              <div style={{ paddingBottom: isLast ? 0 : "0.6rem", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", flexShrink: 0 }}>{e.time}</span>
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text)" }}>{e.title}</span>
                  {e.status && (
                    <span style={{ fontSize: "0.45rem", color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {e.status}
                    </span>
                  )}
                </div>
                {e.description && (
                  <div style={{ fontSize: "0.55rem", color: "var(--text-dim)", marginTop: "0.1rem", lineHeight: 1.4 }}>
                    {e.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
