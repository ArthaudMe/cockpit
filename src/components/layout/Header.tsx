"use client";

import { useState, useEffect } from "react";

export function Header({
  claudeStatus,
  onRetryConnection,
  onAlertsClick,
  onBriefingsClick,
  onTerminalClick,
  onSettingsClick,
}: {
  claudeStatus: { connected: boolean; version?: string; checking: boolean };
  onRetryConnection: () => void;
  onAlertsClick?: () => void;
  onBriefingsClick?: () => void;
  onTerminalClick?: () => void;
  onSettingsClick?: () => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [mode, setMode] = useState<"demo" | "live">("demo");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [alertsRes, contextRes] = await Promise.all([
          fetch("/api/alerts?unreadOnly=true"),
          fetch("/api/connectors"),
        ]);
        const alertsData = await alertsRes.json();
        const contextData = await contextRes.json();

        setUnreadCount(alertsData.unreadCount || 0);
        const hasConfigured = (contextData.connectors || []).some(
          (c: { configured: boolean }) => c.configured,
        );
        setMode(hasConfigured ? "live" : "demo");
      } catch {
        // Ignore errors on status fetch
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.4rem 0.75rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: "2rem",
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
          MIO COCKPIT
        </span>
        <span
          style={{
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            letterSpacing: "0.03em",
          }}
        >
          founder&apos;s workspace
        </span>
        <span
          className={`tag ${mode === "live" ? "tag-green" : "tag-dim"}`}
          style={{ fontSize: "0.4rem" }}
        >
          {mode === "live" ? "LIVE" : "DEMO"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Alerts button */}
        {onAlertsClick && (
          <button
            onClick={onAlertsClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
              fontSize: "0.55rem",
              color: unreadCount > 0 ? "var(--text)" : "var(--text-dim)",
              position: "relative",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>
              {unreadCount > 0 ? "🔔" : "🔕"}
            </span>
            ALERTS
            {unreadCount > 0 && (
              <span
                style={{
                  background: "var(--red)",
                  color: "var(--bg)",
                  borderRadius: "50%",
                  width: 14,
                  height: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.4rem",
                  fontWeight: 700,
                  position: "absolute",
                  top: -4,
                  right: -4,
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        )}

        {/* Briefings button */}
        {onBriefingsClick && (
          <button
            onClick={onBriefingsClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
              fontSize: "0.55rem",
              color: "var(--text-dim)",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>📋</span>
            BRIEFINGS
          </button>
        )}

        {/* Terminal button */}
        {onTerminalClick && (
          <button
            onClick={onTerminalClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "none",
              border: "1px solid var(--green)",
              borderRadius: 3,
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
              fontSize: "0.55rem",
              color: "var(--green)",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>▸</span>
            TERMINAL
          </button>
        )}

        {/* Settings button */}
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.2rem 0.5rem",
              cursor: "pointer",
              fontSize: "0.55rem",
              color: "var(--text-dim)",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>⚙</span>
            SETTINGS
          </button>
        )}

        {/* Claude status */}
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
