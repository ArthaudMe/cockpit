"use client";

export function Header({
  claudeStatus,
  onRetryConnection,
}: {
  claudeStatus: { connected: boolean; version?: string; checking: boolean };
  onRetryConnection: () => void;
}) {
  return (
    <header
      className="cockpit-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.4rem 0.75rem 0.4rem 5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: "2.2rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "var(--text)",
            textTransform: "uppercase",
          }}
        >
          COCKPIT
        </span>
        <span
          style={{
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            letterSpacing: "0.03em",
          }}
        >
          pilot your company
        </span>
      </div>

      <div className="cockpit-header-actions" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button
          onClick={onRetryConnection}
          disabled={claudeStatus.checking}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 3,
            padding: "0.2rem 0.5rem",
            cursor: claudeStatus.checking ? "wait" : "pointer",
            fontSize: "0.55rem",
            color: "var(--text-dim)",
          }}
        >
          <span
            className="dot"
            style={{
              background: claudeStatus.checking
                ? "var(--yellow)"
                : claudeStatus.connected
                  ? "var(--green)"
                  : "var(--red)",
              animation: claudeStatus.checking ? "spin 1s linear infinite" : undefined,
            }}
          />
          {claudeStatus.checking
            ? "CHECKING..."
            : claudeStatus.connected
              ? `CLAUDE CLI ${claudeStatus.version || ""}`
              : "CLAUDE DISCONNECTED"}
        </button>
      </div>
    </header>
  );
}
