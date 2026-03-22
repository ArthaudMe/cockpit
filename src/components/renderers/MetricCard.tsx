"use client";

type Metric = {
  label: string;
  value: string;
  change?: string;
  period?: string;
};

export function RenderMetricCards({
  title,
  metrics,
}: {
  title?: string;
  metrics: Metric[];
}) {
  return (
    <div style={{ margin: "0.4rem 0" }}>
      {title && (
        <div
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "0.35rem",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(metrics.length, 4)}, 1fr)`, gap: "0.35rem" }}>
        {metrics.map((m, i) => {
          const isPositive = m.change?.startsWith("+") || m.change?.startsWith("↑");
          const isNegative = m.change?.startsWith("-") || m.change?.startsWith("↓");
          const changeColor = isPositive ? "#4ade80" : isNegative ? "#f87171" : "var(--text-muted)";

          return (
            <div
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "0.5rem",
                background: "var(--surface)",
              }}
            >
              <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {m.label}
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", marginTop: "0.15rem" }}>
                {m.value}
              </div>
              {(m.change || m.period) && (
                <div style={{ fontSize: "0.5rem", marginTop: "0.2rem", display: "flex", gap: "0.3rem" }}>
                  {m.change && <span style={{ color: changeColor, fontWeight: 600 }}>{m.change}</span>}
                  {m.period && <span style={{ color: "var(--text-muted)" }}>{m.period}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
