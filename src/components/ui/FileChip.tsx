"use client";

export function FileChip({
  path,
  line,
  onOpenFile,
}: {
  path: string;
  line?: number;
  onOpenFile: (path: string) => void;
}) {
  // Show just the relative-looking portion
  const display = path.split("/").slice(-3).join("/");
  const label = line ? `${display}:${line}` : display;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpenFile(path);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "0.1rem 0.4rem",
        fontSize: "0.55rem",
        color: "var(--accent)",
        cursor: "pointer",
        fontFamily: "inherit",
        verticalAlign: "middle",
        margin: "0.05rem 0.15rem",
        transition: "all 0.1s",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.08)";
        e.currentTarget.style.borderColor = "var(--border-light)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
      title={path + (line ? `:${line}` : "")}
    >
      <span style={{ opacity: 0.6, fontSize: "0.5rem" }}>&#9634;</span>
      {label}
    </button>
  );
}
