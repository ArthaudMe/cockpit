"use client";

import { useState, useRef, useEffect } from "react";

export interface NotificationItem {
  id: string;
  ruleId: string;
  title: string;
  body: string;
  icon: string;
  source: string;
  severity: "info" | "warning" | "urgent";
  createdAt: number;
  read: boolean;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function severityColor(severity: NotificationItem["severity"]): string {
  switch (severity) {
    case "urgent":
      return "var(--red)";
    case "warning":
      return "var(--yellow)";
    default:
      return "var(--blue)";
  }
}

export function NotificationBell({
  notifications,
  unreadCount,
  onMarkAllRead,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unreadCount > 0) {
            onMarkAllRead();
          }
        }}
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
          position: "relative",
        }}
        title="Notifications"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        {/* Bell character */}
        <span style={{ fontSize: "0.75rem" }}>&#9951;</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--red)",
              color: "var(--accent)",
              fontSize: "0.75rem",
              fontWeight: 700,
              minWidth: 13,
              height: 13,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: 280,
            maxHeight: 360,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            overflow: "hidden",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.45rem 0.6rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-dim)",
              }}
            >
              Notifications
            </span>
            {notifications.length > 0 && (
              <button
                onClick={onMarkAllRead}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "1.5rem",
                  textAlign: "center",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                }}
              >
                No notifications yet
              </div>
            ) : (
              [...notifications].reverse().map((n) => (
                <div
                  key={n.id + n.createdAt}
                  style={{
                    display: "flex",
                    gap: "0.45rem",
                    padding: "0.5rem 0.6rem",
                    borderBottom: "1px solid var(--border)",
                    background: n.read ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: `${severityColor(n.severity)}15`,
                      border: `1px solid ${severityColor(n.severity)}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: severityColor(n.severity),
                      flexShrink: 0,
                    }}
                  >
                    {n.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: n.read ? 400 : 600,
                        color: "var(--text)",
                        lineHeight: 1.3,
                      }}
                    >
                      {n.title}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-dim)",
                        lineHeight: 1.4,
                        marginTop: "0.1rem",
                      }}
                    >
                      {n.body}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        marginTop: "0.15rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {n.source}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Unread indicator */}
                  {!n.read && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--blue)",
                        flexShrink: 0,
                        marginTop: 3,
                      }}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
