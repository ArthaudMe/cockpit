"use client";

export function RenderBarChart({
  title,
  data,
}: {
  title?: string;
  data: { label: string; value: number }[];
}) {
  const maxValue = Math.max(...data.map((d) => d.value));

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
      <div style={{ padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: 60,
                flexShrink: 0,
                textAlign: "right",
                fontSize: "0.55rem",
                color: "var(--text-dim)",
              }}
            >
              {d.label}
            </span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <div
                style={{
                  height: 14,
                  borderRadius: 2,
                  width: `${(d.value / maxValue) * 100}%`,
                  minWidth: 3,
                  background: "var(--accent)",
                  opacity: 0.8,
                  transition: "width 0.5s ease-out",
                }}
              />
              <span
                style={{
                  flexShrink: 0,
                  fontSize: "0.55rem",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {typeof d.value === "number" && d.value >= 1000
                  ? d.value.toLocaleString()
                  : d.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
