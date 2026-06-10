"use client";

type Card = {
  title: string;
  status?: string;
  subtitle?: string;
  items?: string[];
};

export function RenderCardGrid({
  title,
  cards,
  onCardClick,
}: {
  title?: string;
  cards: Card[];
  onCardClick?: (cardIndex: number, card: Card) => void;
}) {
  return (
    <div style={{ margin: "0.4rem 0" }}>
      {title && (
        <div
          style={{
            fontSize: "0.68rem",
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => onCardClick?.(i, card)}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "0.5rem",
              background: "var(--surface)",
              ...(onCardClick ? { cursor: "pointer", transition: "background 0.1s" } : {}),
            }}
            onMouseEnter={(e) => { if (onCardClick) e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={(e) => { if (onCardClick) e.currentTarget.style.background = "var(--surface)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text)" }}>
                {card.title}
              </span>
              {card.status && (
                <span className={`tag ${card.status === "Active" ? "tag-green" : "tag-yellow"}`}>
                  {card.status}
                </span>
              )}
            </div>
            {card.subtitle && (
              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                {card.subtitle}
              </div>
            )}
            {card.items && card.items.length > 0 && (
              <div style={{ marginTop: "0.3rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                {card.items.map((item, j) => (
                  <div
                    key={j}
                    style={{ fontSize: "0.65rem", color: "var(--text-dim)", display: "flex", gap: "0.25rem" }}
                  >
                    <span style={{ color: "var(--accent)" }}>-</span>
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
