"use client";

import { NotificationBell, type NotificationItem } from "./NotificationBell";

export type AppMode = "work" | "dashboard";

function formatCachedTime(cachedAt?: number): string {
  if (!cachedAt) return "";
  const diff = Math.round((Date.now() - cachedAt) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

export function Header({
  onSettingsClick,
  activeMode,
  onModeChange,
  notifications = [],
  unreadCount = 0,
  onMarkAllRead,
  offlineInfo,
}: {
  onSettingsClick?: () => void;
  activeMode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
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
        position: "relative",
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
              color: "var(--yellow)",
              background: "color-mix(in srgb, var(--yellow) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--yellow) 30%, transparent)",
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

      {activeMode && onModeChange && (
        <div
          className="cockpit-header-actions"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--border)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {(["work", "dashboard"] as AppMode[]).map((mode) => {
            const active = activeMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onModeChange(mode)}
                style={{
                  background: active ? "var(--text)" : "transparent",
                  border: "none",
                  borderRight: mode === "work" ? "1px solid var(--border)" : "none",
                  color: active ? "var(--bg)" : "var(--text-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  padding: "0.18rem 0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
                aria-pressed={active}
              >
                {mode === "work" ? "Work" : "Dashboard"}
              </button>
            );
          })}
        </div>
      )}

      <div className="cockpit-header-actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <NotificationBell
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkAllRead={onMarkAllRead || (() => {})}
        />
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            aria-label="Open settings"
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
