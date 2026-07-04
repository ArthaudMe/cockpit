"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage } from "@/components/ui/ChatMessage";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { DatasourceData } from "@/lib/datasources/types";
import { buildDashboardDraft } from "@/lib/dashboard/planner";
import {
  buildDashboardFocusContext,
  dashboardServiceLabel,
  runDashboard,
} from "@/lib/dashboard/runner";
import type {
  DashboardMetricCard,
  DashboardMetricState,
  DashboardServiceId,
  DashboardSpec,
} from "@/lib/dashboard/types";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type DashboardViewProps = {
  data: DatasourceData;
  claudeConnected: boolean;
  onConnectService: (serviceId: string) => void;
  onOpenSettings: () => void;
};

const STARTERS = [
  "Activation, retention, revenue, pipeline, and execution velocity",
  "Product usage, active users, conversion, and churn risk",
  "Pipeline, revenue, customer feedback, and team execution",
];

const STATE_LABELS: Record<DashboardMetricState, string> = {
  available: "Live",
  needs_connection: "Needs connection",
  needs_definition: "Needs definition",
  unsupported: "Not supported",
  no_data: "No data",
};

const STATE_COLORS: Record<DashboardMetricState, string> = {
  available: "var(--green)",
  needs_connection: "var(--yellow)",
  needs_definition: "var(--blue)",
  unsupported: "var(--text-muted)",
  no_data: "var(--orange)",
};

async function readErrorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).trim();
  } catch {
    return "";
  }
}

function chatFailureMessage(res: Response, body: string): string {
  if (res.status === 401 && body) return body;
  if (res.status === 503 && body) return body;
  if (res.status >= 500) return "Something went wrong. Please try again in a moment.";
  return body || "Sorry, I couldn't process that request. Please try again.";
}

function serviceCanConnect(service: DashboardServiceId): boolean {
  return !["stripe", "mcp"].includes(service);
}

export function DashboardView({
  data,
  claudeConnected,
  onConnectService,
  onOpenSettings,
}: DashboardViewProps) {
  const [dashboard, setDashboard] = useState<DashboardSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/dashboards")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard");
        return res.json();
      })
      .then((payload) => {
        setDashboard(payload.activeDashboard || null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const saveDashboard = useCallback(async (prompt: string) => {
    setSaving(true);
    setError(null);
    const draft = buildDashboardDraft(prompt);
    try {
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard: draft }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to save dashboard");
      setDashboard(payload.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save dashboard");
    } finally {
      setSaving(false);
    }
  }, []);

  const resetDashboard = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/dashboards", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to reset dashboard");
      setDashboard(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset dashboard");
    }
  }, []);

  const run = useMemo(() => (dashboard ? runDashboard(dashboard, data) : null), [dashboard, data]);

  if (loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-loading">
          <span className="dot" style={{ background: "var(--accent)", animation: "pulse 1.5s infinite" }} />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (!dashboard || !run) {
    return (
      <FirstRunDashboard
        saving={saving}
        error={error}
        onSubmit={saveDashboard}
      />
    );
  }

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-kicker">Dashboard</div>
        <div className="dashboard-title">{dashboard.title}</div>
        <div className="dashboard-prompt">{dashboard.prompt}</div>

        <div className="dashboard-summary">
          <SummaryRow label="Live" value={run.summary.available} color="var(--green)" />
          <SummaryRow label="Needs connection" value={run.summary.needsConnection} color="var(--yellow)" />
          <SummaryRow label="Needs definition" value={run.summary.needsDefinition} color="var(--blue)" />
          <SummaryRow label="No data" value={run.summary.noData} color="var(--orange)" />
        </div>

        <button className="dashboard-secondary-btn" onClick={resetDashboard}>
          Rebuild dashboard
        </button>
        <button className="dashboard-secondary-btn" onClick={onOpenSettings}>
          Open settings
        </button>
        {error && <div className="dashboard-error">{error}</div>}
      </aside>

      <main className="dashboard-main">
        <div className="dashboard-main-header">
          <div>
            <div className="dashboard-kicker">Company results</div>
            <h1 className="dashboard-heading">How the company is doing</h1>
          </div>
          <div className="dashboard-freshness">
            {data._offline
              ? "cached snapshot"
              : "live snapshot"}
          </div>
        </div>

        <div className="dashboard-card-grid">
          {run.cards.map((card) => (
            <MetricCard
              key={card.id}
              card={card}
              onConnectService={onConnectService}
            />
          ))}
        </div>

        <section className="dashboard-readiness">
          <div className="dashboard-section-title">Data readiness</div>
          <div className="dashboard-readiness-list">
            {run.cards
              .filter((card) => card.state !== "available")
              .map((card) => (
                <ReadinessItem
                  key={card.id}
                  card={card}
                  onConnectService={onConnectService}
                />
              ))}
            {run.cards.every((card) => card.state === "available") && (
              <div className="dashboard-empty-note">Every requested metric has live data.</div>
            )}
          </div>
        </section>
      </main>

      <aside className="dashboard-chat-pane">
        <DashboardChat
          key={dashboard.id}
          dashboard={dashboard}
          runContext={buildDashboardFocusContext(dashboard, run)}
          claudeConnected={claudeConnected}
        />
      </aside>
    </div>
  );
}

function FirstRunDashboard({
  saving,
  error,
  onSubmit,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState("");

  const submit = () => {
    const value = prompt.trim();
    if (!value || saving) return;
    onSubmit(value);
  };

  return (
    <div className="dashboard-shell dashboard-shell-empty">
      <div className="dashboard-first-run">
        <div className="dashboard-kicker">New dashboard</div>
        <h1 className="dashboard-heading">What do you want to understand about the company?</h1>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="e.g. I want activation, retention, revenue, pipeline, product usage, and execution velocity."
          className="dashboard-prompt-input"
          autoFocus
        />
        <div className="dashboard-starters">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              className="dashboard-starter-btn"
              onClick={() => setPrompt(starter)}
            >
              {starter}
            </button>
          ))}
        </div>
        <div className="dashboard-first-actions">
          <button
            className="dashboard-primary-btn"
            disabled={!prompt.trim() || saving}
            onClick={submit}
          >
            {saving ? "Building..." : "Build dashboard"}
          </button>
          <span className="dashboard-hint">Cmd+Enter</span>
        </div>
        {error && <div className="dashboard-error">{error}</div>}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="dashboard-summary-row">
      <span>
        <span className="dot" style={{ background: color, marginRight: "0.35rem" }} />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function StateBadge({ state }: { state: DashboardMetricState }) {
  return (
    <span
      className="dashboard-state-badge"
      style={{
        color: STATE_COLORS[state],
        background: `color-mix(in srgb, ${STATE_COLORS[state]} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${STATE_COLORS[state]} 25%, transparent)`,
      }}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

function MetricCard({
  card,
  onConnectService,
}: {
  card: DashboardMetricCard;
  onConnectService: (serviceId: string) => void;
}) {
  const firstConnectable = card.missingServices.find(serviceCanConnect);

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-top">
        <div>
          <div className="dashboard-card-title">{card.title}</div>
          <div className="dashboard-card-source">
            {card.requiredServices.map(dashboardServiceLabel).join(" + ") || "Cockpit"}
          </div>
        </div>
        <StateBadge state={card.state} />
      </div>

      {card.state === "available" ? (
        <>
          <div className="dashboard-card-value">{card.value}</div>
          <div className="dashboard-card-change">
            {card.change || "live"} <span>{card.period ? `/ ${card.period}` : ""}</span>
          </div>
        </>
      ) : (
        <div className="dashboard-card-blocked">
          {card.state === "needs_connection"
            ? card.missingServices.map(dashboardServiceLabel).join(", ")
            : STATE_LABELS[card.state]}
        </div>
      )}

      <div className="dashboard-card-detail">{card.detail}</div>

      {firstConnectable && (
        <button
          className="dashboard-card-action"
          onClick={() => onConnectService(firstConnectable)}
        >
          Connect {dashboardServiceLabel(firstConnectable)}
        </button>
      )}
    </div>
  );
}

function ReadinessItem({
  card,
  onConnectService,
}: {
  card: DashboardMetricCard;
  onConnectService: (serviceId: string) => void;
}) {
  const firstConnectable = card.missingServices.find(serviceCanConnect);

  return (
    <div className="dashboard-readiness-item">
      <div className="dashboard-readiness-head">
        <span>{card.title}</span>
        <StateBadge state={card.state} />
      </div>
      <div className="dashboard-readiness-detail">{card.detail}</div>
      {card.setupSteps.length > 0 && (
        <ul className="dashboard-step-list">
          {card.setupSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}
      {firstConnectable && (
        <button
          className="dashboard-card-action"
          onClick={() => onConnectService(firstConnectable)}
        >
          Connect {dashboardServiceLabel(firstConnectable)}
        </button>
      )}
    </div>
  );
}

function DashboardChat({
  dashboard,
  runContext,
  claudeConnected,
}: {
  dashboard: DashboardSpec;
  runContext: string;
  claudeConnected: boolean;
}) {
  const [messages, setMessages] = usePersistedState<Message[]>(
    `cockpit-dashboard-chat-${dashboard.id}`,
    [],
  );
  const [inputValue, setInputValue] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async (directText?: string) => {
    const msg = (directText || inputValue).trim();
    if (!msg || streaming || !claudeConnected) return;

    setInputValue("");
    setMessages((prev) => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          focusContext: runContext,
        }),
      });

      if (!res.ok || !res.body) {
        const body = await readErrorBody(res);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: chatFailureMessage(res, body) };
          return next;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: err instanceof Error && err.message.includes("Failed to fetch")
            ? "Couldn't reach the server. Please check your connection and try again."
            : "Something unexpected happened. Please try again.",
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [claudeConnected, inputValue, runContext, setMessages, streaming]);

  const starters = [
    "What changed this week?",
    "What should I focus on?",
    "Which metrics are blocked by data setup?",
  ];

  return (
    <div className="dashboard-chat">
      <div className="dashboard-chat-header">
        <div>
          <div className="dashboard-kicker">Ask</div>
          <div className="dashboard-chat-title">About this dashboard</div>
        </div>
        <span
          className="dot"
          style={{
            background: claudeConnected ? "var(--green)" : "var(--red)",
            animation: claudeConnected ? "pulse 3s ease-in-out infinite" : "none",
          }}
        />
      </div>

      <div ref={scrollRef} className="dashboard-chat-content">
        {messages.length === 0 && (
          <div className="agent-suggestions">
            {starters.map((starter) => (
              <button
                key={starter}
                disabled={!claudeConnected}
                className="agent-suggestion-btn"
                onClick={() => sendMessage(starter)}
              >
                <span style={{ color: "var(--blue)", marginRight: "0.3rem" }}>›</span>
                {starter}
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="agent-message-wrapper">
            {msg.role === "user" ? (
              <div className="agent-user-msg">
                <span className="agent-prompt-indicator">❯</span>
                <span>{msg.content}</span>
              </div>
            ) : (
              <div className="agent-assistant-msg">
                {msg.content ? (
                  <ChatMessage message={msg} />
                ) : (
                  streaming && i === messages.length - 1 && (
                    <div className="agent-thinking">
                      <span className="agent-thinking-dots">
                        <span className="agent-thinking-dot" />
                        <span className="agent-thinking-dot" style={{ animationDelay: "0.2s" }} />
                        <span className="agent-thinking-dot" style={{ animationDelay: "0.4s" }} />
                      </span>
                      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>Thinking...</span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="dashboard-chat-input-area">
        <span className="agent-prompt-indicator">❯</span>
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={claudeConnected ? "Ask about results..." : "Claude CLI not connected"}
          disabled={!claudeConnected || streaming}
          className="dashboard-chat-input"
          rows={1}
        />
      </div>
    </div>
  );
}
