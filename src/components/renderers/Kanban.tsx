"use client";

type KanbanCard = {
  title: string;
  subtitle?: string;
  tag?: string;
};

type KanbanColumn = {
  name: string;
  cards: KanbanCard[];
};

const tagColors: Record<string, string> = {
  urgent: "#f87171",
  high: "#fb923c",
  medium: "#facc15",
  low: "#4ade80",
  bug: "#f87171",
  feature: "var(--accent)",
  chore: "var(--text-muted)",
};

function getTagColor(tag?: string): string {
  if (!tag) return "var(--text-muted)";
  return tagColors[tag.toLowerCase()] || "var(--accent)";
}

export function RenderKanban({
  title,
  columns,
}: {
  title?: string;
  columns: KanbanColumn[];
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
      <div style={{ display: "flex", gap: "0.35rem", overflowX: "auto" }}>
        {columns.map((col, ci) => (
          <div
            key={ci}
            style={{
              flex: 1,
              minWidth: 120,
              border: "1px solid var(--border)",
              borderRadius: 4,
              overflow: "hidden",
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                padding: "0.3rem 0.5rem",
                fontSize: "0.5rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>{col.name}</span>
              <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>{col.cards.length}</span>
            </div>
            <div style={{ padding: "0.35rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {col.cards.map((card, ki) => (
                <div
                  key={ki}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "0.35rem 0.4rem",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>
                    {card.title}
                  </div>
                  {card.subtitle && (
                    <div style={{ fontSize: "0.5rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
                      {card.subtitle}
                    </div>
                  )}
                  {card.tag && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: "0.2rem",
                        fontSize: "0.4rem",
                        fontWeight: 600,
                        color: getTagColor(card.tag),
                        background: `${getTagColor(card.tag)}15`,
                        padding: "0.05rem 0.25rem",
                        borderRadius: 2,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {card.tag}
                    </span>
                  )}
                </div>
              ))}
              {col.cards.length === 0 && (
                <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", padding: "0.3rem", textAlign: "center" }}>
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
