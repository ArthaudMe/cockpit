"use client";

export function RenderMermaid({
  title,
  code,
}: {
  title?: string;
  code: string;
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
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        <span style={{ fontSize: "0.55rem", opacity: 0.7 }}>◈</span>
        {title || "Diagram"}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "0.6rem 0.75rem",
          background: "var(--surface)",
          fontSize: "0.6rem",
          fontFamily: "var(--font-mono, 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace)",
          lineHeight: 1.6,
          color: "var(--text-dim)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
