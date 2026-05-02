"use client";

import { NotificationBell, type NotificationItem } from "./NotificationBell";

function formatCachedTime(cachedAt?: number): string {
  if (!cachedAt) return "";
  const diff = Math.round((Date.now() - cachedAt) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export function Header({
  claudeStatus,
  onRetryConnection,
  onSettingsClick,
  notifications = [],
  unreadCount = 0,
  onMarkAllRead,
  offlineInfo,
}: {
  claudeStatus: { connected: boolean; version?: string; checking: boolean };
  onRetryConnection: () => void;
  onSettingsClick?: () => void;
  notifications?: NotificationItem[];
  unreadCount?: number;
  onMarkAllRead?: () => void;
  offlineInfo?: { offline: boolean; cachedAt?: number };
}) {
  return (
    <header
      className="cockpit-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.4rem 0.75rem 0.4rem 5.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        minHeight: "2.2rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          style={{
            fontSize: "0.75rem",
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
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            letterSpacing: "0.03em",
          }}
        >
          pilot your company
        </span>
        {offlineInfo?.offline && (
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--yellow, #e5a100)",
              background: "rgba(229, 161, 0, 0.1)",
              border: "1px solid rgba(229, 161, 0, 0.3)",
              borderRadius: 3,
              padding: "0.1rem 0.35rem",
              letterSpacing: "0.05em",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
            title={offlineInfo.cachedAt ? `Cached ${formatCachedTime(offlineInfo.cachedAt)}` : "Using cached data"}
          >
            OFFLINE {offlineInfo.cachedAt ? `(${formatCachedTime(offlineInfo.cachedAt)})` : ""}
          </span>
        )}
      </div>

      <div className="cockpit-header-actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
            fontSize: "0.75rem",
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
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead || (() => {})}
        />
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.2rem 0.4rem",
              cursor: "pointer",
              fontSize: "0.75rem",
              color: "var(--text-dim)",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
            }}
            title="Settings"
          >
            &#9881;
          </button>
        )}
      </div>
    </header>
  );
}
