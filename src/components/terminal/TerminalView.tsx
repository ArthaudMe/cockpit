"use client";

import { useState, useEffect, useCallback } from "react";
import { Terminal } from "./Terminal";

type TerminalSession = {
  id: string;
  label: string;
  args?: string[];
  cwd?: string;
  status: "connecting" | "running" | "exited";
  exitCode?: number;
  pid?: number;
};

function generateId(): string {
  return `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function TerminalView({
  onClose,
  initialContext,
  initialLabel,
}: {
  onClose: () => void;
  initialContext?: string;
  initialLabel?: string;
}) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");

  // Check terminal server status
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3003");
    ws.onopen = () => {
      setServerStatus("connected");
      ws.close();
    };
    ws.onerror = () => {
      setServerStatus("disconnected");
    };
  }, []);

  // Create initial session on mount
  useEffect(() => {
    if (serverStatus !== "connected") return;
    if (sessions.length > 0) return;

    const id = generateId();
    const args: string[] = [];

    if (initialContext) {
      args.push("--append-system-prompt", initialContext);
    }

    const session: TerminalSession = {
      id,
      label: initialLabel || "Claude Code",
      args,
      status: "connecting",
    };

    setSessions([session]);
    setActiveSessionId(id);
  }, [serverStatus, sessions.length, initialContext, initialLabel]);

  const createSession = useCallback(
    (label?: string, context?: string) => {
      const id = generateId();
      const args: string[] = [];

      if (context) {
        args.push("--append-system-prompt", context);
      }

      const session: TerminalSession = {
        id,
        label: label || `Terminal ${sessions.length + 1}`,
        args,
        status: "connecting",
      };

      setSessions((prev) => [...prev, session]);
      setActiveSessionId(id);
    },
    [sessions.length],
  );

  const closeSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setSessions((prev) => {
          if (prev.length > 0) {
            setActiveSessionId(prev[prev.length - 1].id);
          } else {
            onClose();
          }
          return prev;
        });
      }
    },
    [activeSessionId, onClose],
  );

  const handleStarted = useCallback(
    (sessionId: string, pid: number) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: "running" as const, pid } : s,
        ),
      );
    },
    [],
  );

  const handleExit = useCallback((sessionId: string, code: number) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, status: "exited" as const, exitCode: code }
          : s,
      ),
    );
  }, []);

  // Double-ESC to close
  useEffect(() => {
    let lastEsc = 0;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEsc < 300) {
          onClose();
        }
        lastEsc = now;
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        borderRadius: 4,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {/* Terminal header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.3rem 0.5rem",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          minHeight: "1.8rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            overflow: "hidden",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-dim)",
              fontSize: "0.5rem",
              padding: "0.1rem 0.35rem",
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="Double-press ESC to close"
          >
            ESC ESC
          </button>

          {/* Session tabs */}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.2rem",
                padding: "0.15rem 0.4rem",
                borderRadius: 3,
                fontSize: "0.5rem",
                cursor: "pointer",
                background:
                  s.id === activeSessionId
                    ? "var(--surface-hover)"
                    : "transparent",
                color:
                  s.id === activeSessionId
                    ? "var(--text)"
                    : "var(--text-muted)",
                border:
                  s.id === activeSessionId
                    ? "1px solid var(--border)"
                    : "1px solid transparent",
              }}
            >
              <span
                className="dot"
                style={{
                  background:
                    s.status === "running"
                      ? "var(--green)"
                      : s.status === "exited"
                        ? "var(--red)"
                        : "var(--yellow)",
                  animation:
                    s.status === "connecting"
                      ? "spin 1s linear infinite"
                      : undefined,
                }}
              />
              <span>{s.label}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(s.id);
                }}
                style={{
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  marginLeft: "0.15rem",
                  fontSize: "0.55rem",
                  lineHeight: 1,
                }}
              >
                ×
              </span>
            </div>
          ))}

          {/* New session button */}
          <button
            onClick={() => createSession()}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-muted)",
              fontSize: "0.5rem",
              padding: "0.1rem 0.3rem",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            +
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            flexShrink: 0,
          }}
        >
          {activeSession && (
            <span
              style={{
                fontSize: "0.45rem",
                color: "var(--text-muted)",
              }}
            >
              {activeSession.status === "running"
                ? `PID ${activeSession.pid}`
                : activeSession.status === "exited"
                  ? `exited (${activeSession.exitCode})`
                  : "connecting..."}
            </span>
          )}
          <span
            style={{
              fontSize: "0.5rem",
              color:
                serverStatus === "connected"
                  ? "var(--text-dim)"
                  : "var(--red)",
            }}
          >
            {serverStatus === "connected"
              ? "terminal-server"
              : serverStatus === "disconnected"
                ? "server offline"
                : "checking..."}
          </span>
          <span
            className="dot"
            style={{
              background:
                serverStatus === "connected"
                  ? "var(--green)"
                  : serverStatus === "disconnected"
                    ? "var(--red)"
                    : "var(--yellow)",
            }}
          />
        </div>
      </div>

      {/* Terminal content */}
      <div style={{ flex: 1, position: "relative" }}>
        {serverStatus === "disconnected" ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.5rem",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontSize: "0.7rem" }}>
              Terminal server not running
            </span>
            <span style={{ fontSize: "0.55rem", color: "var(--text-dim)" }}>
              Start it with: npx tsx terminal-server.ts
            </span>
            <button
              onClick={() => setServerStatus("checking")}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 3,
                color: "var(--text-dim)",
                fontSize: "0.55rem",
                padding: "0.2rem 0.5rem",
                cursor: "pointer",
                marginTop: "0.3rem",
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              style={{
                position: "absolute",
                inset: 0,
                display:
                  session.id === activeSessionId ? "block" : "none",
                padding: "0.25rem",
              }}
            >
              <Terminal
                sessionId={session.id}
                args={session.args}
                cwd={session.cwd}
                onStarted={(pid) => handleStarted(session.id, pid)}
                onExit={(code) => handleExit(session.id, code)}
              />
            </div>
          ))
        )}
      </div>

      {/* Hint bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.15rem 0.5rem",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: "0.45rem",
          color: "var(--text-muted)",
        }}
      >
        <span>double-esc to close</span>
        <span>full interactive claude code session</span>
      </div>
    </div>
  );
}
