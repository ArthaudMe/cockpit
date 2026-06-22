"use client";

export function RenderTable({
  title,
  columns,
  rows,
  onRowClick,
}: {
  title?: string;
  columns: string[];
  rows: string[][];
  onRowClick?: (rowIndex: number, row: string[]) => void;
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
            fontSize: "0.68rem",
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
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    padding: "0.3rem 0.5rem",
                    textAlign: "left",
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                onClick={() => onRowClick?.(ri, row)}
                style={{
                  borderTop: "1px solid var(--border)",
                  background: ri % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--text) 2%, transparent)",
                  ...(onRowClick ? { cursor: "pointer" } : {}),
                }}
                onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = "color-mix(in srgb, var(--text) 6%, transparent)"; }}
                onMouseLeave={(e) => { if (onRowClick) e.currentTarget.style.background = ri % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--text) 2%, transparent)"; }}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    style={{
                      padding: "0.3rem 0.5rem",
                      color: "var(--text)",
                    }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
