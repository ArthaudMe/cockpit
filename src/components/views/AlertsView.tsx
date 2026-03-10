"use client";

import { useState, useEffect, useCallback } from "react";

type Alert = {
  id: number;
  source: string;
  title: string;
  body: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  read: number;
  actioned: number;
  created_at: string;
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "var(--red)",
  high: "var(--yellow)",
  normal: "var(--text-dim)",
  low: "var(--text-muted)",
};

const SOURCE_ICONS: Record<string, string> = {
  Linear: "📋",
  GitHub: "🐙",
  Slack: "💬",
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function AlertsView({ onClose }: { onClose: () => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("Failed to fetch alerts", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAction = async (action: string, alertId?: number) => {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, alertId }),
    });
    fetchAlerts();
  };

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 }}>
      <div className="panel-header" style={{ cursor: "default" }}>
        <div className="panel-title-row">
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-dim)",
              fontSize: "0.55rem",
              padding: "0.15rem 0.4rem",
              cursor: "pointer",
              marginRight: "0.5rem",
            }}
          >
            ESC
          </button>
          <span className="panel-title">Alerts</span>
          {unreadCount > 0 && (
            <span className="panel-count" style={{ background: "var(--red)", color: "var(--bg)" }}>
              {unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={() => handleAction("markAllRead")}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 3,
            color: "var(--text-dim)",
            fontSize: "0.5rem",
            padding: "0.15rem 0.4rem",
            cursor: "pointer",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Mark all read
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.6rem" }}>
            Loading alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.6rem" }}>
            No alerts yet. Configure webhooks to receive alerts from Linear, GitHub, and Slack.
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="feed-item"
              style={{
                opacity: alert.read ? 0.6 : 1,
                borderLeft: `2px solid ${PRIORITY_COLORS[alert.priority]}`,
                paddingLeft: "0.6rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.3rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ fontSize: "0.6rem" }}>{SOURCE_ICONS[alert.source] || "🔔"}</span>
                  <span style={{ fontSize: "0.5rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                    {alert.source}
                  </span>
                  <span
                    className="tag"
                    style={{
                      color: PRIORITY_COLORS[alert.priority],
                      borderColor: PRIORITY_COLORS[alert.priority],
                      fontSize: "0.45rem",
                    }}
                  >
                    {alert.priority}
                  </span>
                </div>
                <span className="feed-time">{timeAgo(alert.created_at)}</span>
              </div>
              <div className="feed-title" style={{ fontWeight: alert.read ? 400 : 600 }}>
                {alert.title}
              </div>
              {alert.body && (
                <div style={{ fontSize: "0.55rem", color: "var(--text-dim)", marginTop: "0.15rem" }}>
                  {alert.body}
                </div>
              )}
              <div style={{ display: "flex", gap: "0.3rem", marginTop: "0.3rem" }}>
                {!alert.read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAction("markRead", alert.id); }}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 2,
                      color: "var(--text-muted)",
                      fontSize: "0.45rem",
                      padding: "0.1rem 0.3rem",
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleAction("delete", alert.id); }}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 2,
                    color: "var(--text-muted)",
                    fontSize: "0.45rem",
                    padding: "0.1rem 0.3rem",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
