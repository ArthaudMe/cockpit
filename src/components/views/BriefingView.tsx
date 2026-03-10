"use client";

import { useState, useEffect } from "react";
import { ChatMessage } from "../ui/ChatMessage";

type Briefing = {
  id: number;
  type: string;
  content: string;
  metadata: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  daily: "Daily Briefing",
  "meeting-prep": "Meeting Prep",
};

const TYPE_ICONS: Record<string, string> = {
  daily: "📋",
  "meeting-prep": "📅",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BriefingView({ onClose }: { onClose: () => void }) {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selected, setSelected] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/briefings")
      .then((r) => r.json())
      .then((data) => {
        setBriefings(data.briefings || []);
        if (data.briefings?.length > 0) {
          setSelected(data.briefings[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ESC to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

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
          <span className="panel-title">Briefings</span>
          <span className="panel-count">{briefings.length}</span>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Briefing list */}
        <div
          style={{
            width: 200,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {loading ? (
            <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.55rem" }}>
              Loading...
            </div>
          ) : briefings.length === 0 ? (
            <div style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.55rem" }}>
              No briefings yet. Run a daily briefing or meeting prep task.
            </div>
          ) : (
            briefings.map((b) => (
              <div
                key={b.id}
                onClick={() => setSelected(b)}
                className="feed-item"
                style={{
                  background: selected?.id === b.id ? "var(--surface-hover)" : undefined,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ fontSize: "0.55rem" }}>{TYPE_ICONS[b.type] || "📄"}</span>
                  <span className="feed-title">{TYPE_LABELS[b.type] || b.type}</span>
                </div>
                <span className="feed-time">{formatDate(b.created_at)}</span>
                {b.metadata && (() => {
                  try {
                    const meta = JSON.parse(b.metadata);
                    if (meta.meeting) {
                      return (
                        <span style={{ fontSize: "0.5rem", color: "var(--text-dim)" }}>
                          {meta.meeting}
                        </span>
                      );
                    }
                  } catch { /* ignore */ }
                  return null;
                })()}
              </div>
            ))
          )}
        </div>

        {/* Briefing content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
          {selected ? (
            <div>
              <div style={{ marginBottom: "0.5rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", marginBottom: "0.2rem" }}>
                  <span style={{ fontSize: "0.65rem" }}>{TYPE_ICONS[selected.type] || "📄"}</span>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>
                    {TYPE_LABELS[selected.type] || selected.type}
                  </span>
                </div>
                <span style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>
                  {formatDate(selected.created_at)}
                </span>
              </div>
              <ChatMessage message={{ role: "assistant", content: selected.content }} />
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.6rem" }}>
              Select a briefing to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
