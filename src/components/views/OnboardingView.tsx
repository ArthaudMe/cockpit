"use client";

import { useState, useEffect, useCallback } from "react";

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
};

type DetectionResult = {
  backends: BackendStatus[];
  anyAvailable: boolean;
};

type OnboardingStep = "welcome" | "setup" | "datasources" | "ready";

const BACKEND_INFO: Record<
  string,
  { description: string; installHint: string; authCommand?: string; icon: string }
> = {
  claude: {
    description: "Anthropic's AI assistant. Uses your Claude subscription — no API keys needed.",
    installHint: "curl -fsSL https://claude.ai/install.sh | bash",
    authCommand: "claude login",
    icon: "◇",
  },
  codex: {
    description: "OpenAI's coding agent. Requires an OpenAI API key or account.",
    installHint: "npm install -g @openai/codex",
    icon: "◆",
  },
  ollama: {
    description: "Run open-source models locally. Free, private, no account needed.",
    installHint: "curl -fsSL https://ollama.ai/install.sh | sh",
    icon: "○",
  },
};

interface DatasourceInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  needsOAuth: boolean;
}

export function OnboardingView({
  onRetry,
  checking,
}: {
  onRetry: () => void;
  checking: boolean;
  error?: string;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/detect-backends");
      const data: DetectionResult = await res.json();
      setDetection(data);
      if (data.anyAvailable && step === "setup") {
        // Don't auto-advance — let user see what's available
      }
    } catch {
      // detection failed
    } finally {
      setDetecting(false);
    }
  }, [step]);

  // Detect on mount when entering setup
  useEffect(() => {
    if (step === "setup") {
      detect();
    }
  }, [step, detect]);

  if (step === "welcome") {
    return <WelcomeScreen onContinue={() => setStep("setup")} />;
  }

  if (step === "datasources") {
    return <DatasourcesScreen onContinue={() => setStep("ready")} />;
  }

  if (step === "ready") {
    return <ReadyScreen detection={detection} onEnter={onRetry} />;
  }

  return (
    <SetupScreen
      detection={detection}
      detecting={detecting}
      checking={checking}
      onDetect={detect}
      onContinue={() => {
        // Advance to datasources step
        setStep("datasources");
      }}
    />
  );
}

/* =====================
   Datasources Screen
   ===================== */

function DatasourcesScreen({ onContinue }: { onContinue: () => void }) {
  const [datasources, setDatasources] = useState<DatasourceInfo[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/datasources");
      const data = await res.json();
      setDatasources(data.datasources || []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll for connection status updates (user may be completing OAuth in browser)
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleConnect = useCallback(async (serviceId: string) => {
    setConnecting(serviceId);
    try {
      const res = await fetch(`/api/datasources/connect?service=${serviceId}`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      // Will show as not connected
    }
    // Don't clear connecting state — polling will update status
    setTimeout(() => setConnecting(null), 5000);
  }, []);

  const connectedCount = datasources.filter((d) => d.connected).length;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg)",
        padding: "2rem",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              fontSize: "0.55rem",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "0.5rem",
            }}
          >
            Cockpit
          </div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Connect your datasources
          </div>
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-dim)",
              marginTop: "0.35rem",
              lineHeight: 1.5,
            }}
          >
            Link your tools so Cockpit can see your work.
            <br />
            All data stays on your machine. Cockpit runs entirely locally
            and no one else, including us, can access your data or tokens.
          </div>
        </div>

        {/* Datasource list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {loaded &&
            datasources.map((ds) => (
              <DatasourceCard
                key={ds.id}
                datasource={ds}
                connecting={connecting === ds.id}
                onConnect={() => handleConnect(ds.id)}
              />
            ))}
        </div>

        {/* Continue */}
        <div style={{ marginTop: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            onClick={onContinue}
            style={{
              background: "var(--text)",
              color: "var(--bg)",
              border: "none",
              borderRadius: 5,
              padding: "0.4rem 1.2rem",
              fontSize: "0.65rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            {connectedCount > 0 ? "Continue" : "Skip for now"}
          </button>
          {connectedCount > 0 && (
            <span style={{ fontSize: "0.55rem", color: "var(--text-dim)" }}>
              {connectedCount} connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DatasourceCard({
  datasource,
  connecting,
  onConnect,
}: {
  datasource: DatasourceInfo;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.5rem 0.65rem",
        border: `1px solid ${datasource.connected ? "var(--green)" : "var(--border)"}`,
        borderRadius: 6,
        background: datasource.connected
          ? "rgba(74, 222, 128, 0.04)"
          : "transparent",
        transition: "all 0.2s",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: `1px solid ${datasource.connected ? "var(--green)" : "var(--border-light)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "0.5rem",
          fontWeight: 700,
          color: datasource.connected ? "var(--green)" : "var(--text-dim)",
          flexShrink: 0,
        }}
      >
        {datasource.icon}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {datasource.name}
        </div>
        <div
          style={{
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            marginTop: "0.1rem",
          }}
        >
          {datasource.description}
        </div>
      </div>

      {/* Action */}
      {datasource.connected ? (
        <span
          style={{
            fontSize: "0.5rem",
            color: "var(--green)",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          Connected
        </span>
      ) : datasource.needsOAuth ? (
        <button
          onClick={onConnect}
          disabled={connecting}
          style={{
            background: connecting ? "var(--border)" : "rgba(255,255,255,0.08)",
            color: connecting ? "var(--text-muted)" : "var(--text)",
            border: "1px solid var(--border-light)",
            borderRadius: 4,
            padding: "0.2rem 0.6rem",
            fontSize: "0.55rem",
            fontWeight: 600,
            cursor: connecting ? "default" : "pointer",
            fontFamily: "inherit",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.3rem",
            transition: "all 0.15s",
          }}
        >
          {connecting && (
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--text-muted)",
                animation: "pulse 1s ease-in-out infinite",
              }}
            />
          )}
          {connecting ? "Connecting..." : "Connect"}
        </button>
      ) : (
        <span
          style={{
            fontSize: "0.5rem",
            color: datasource.connected ? "var(--green)" : "var(--text-muted)",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {datasource.connected ? "Detected" : "Not found"}
        </span>
      )}
    </div>
  );
}

/* =====================
   Welcome Screen
   ===================== */

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div style={fullscreen}>
      <div style={{ maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            border: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            fontSize: "1.2rem",
          }}
        >
          &#9672;
        </div>

        <div
          style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            marginBottom: "0.75rem",
          }}
        >
          Pilot your company
        </div>

        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--text-dim)",
            lineHeight: 1.6,
            maxWidth: 300,
            margin: "0 auto 2rem",
          }}
        >
          Your AI cockpit. Multiple engines.
          <br />
          Claude, Codex, Ollama — use what you have.
        </div>

        <button onClick={onContinue} style={primaryBtn}>
          Get started
        </button>

        <div
          style={{
            marginTop: "1rem",
            fontSize: "0.5rem",
            color: "var(--text-muted)",
          }}
        >
          We&apos;ll detect what&apos;s installed
        </div>
      </div>
    </div>
  );
}

/* =====================
   Setup Screen
   ===================== */

function SetupScreen({
  detection,
  detecting,
  checking,
  onDetect,
  onContinue,
}: {
  detection: DetectionResult | null;
  detecting: boolean;
  checking: boolean;
  onDetect: () => void;
  onContinue: () => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const [expandedInstall, setExpandedInstall] = useState<string | null>(null);

  const backends = detection?.backends || [];
  const anyAvailable = detection?.anyAvailable || false;
  const installedCount = backends.filter((b) => b.installed).length;

  const handleInstallClaude = useCallback(async () => {
    setInstalling("claude");
    try {
      const res = await fetch("/api/install-claude", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Re-detect after install
        onDetect();
      }
    } catch {
      // fail silently
    } finally {
      setInstalling(null);
    }
  }, [onDetect]);

  const handleAuthClaude = useCallback(async () => {
    try {
      await fetch("/api/authenticate-claude", { method: "POST" });
      // Give browser time to open, then re-detect
      setTimeout(() => onDetect(), 3000);
    } catch {
      // auth opens browser
    }
  }, [onDetect]);

  return (
    <div style={fullscreen}>
      <div style={{ maxWidth: 500, width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={labelStyle}>Cockpit Setup</div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Connect your engines
          </div>
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-dim)",
              marginTop: "0.35rem",
              lineHeight: 1.5,
            }}
          >
            Cockpit works with any of these AI backends.
            <br />
            Install at least one to get started.
          </div>
        </div>

        {/* Backend cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {detecting && backends.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "1rem",
                justifyContent: "center",
              }}
            >
              <span
                className="dot"
                style={{ background: "var(--accent)", animation: "pulse 1.5s ease-in-out infinite" }}
              />
              <span style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                Detecting installed backends...
              </span>
            </div>
          ) : (
            backends.map((backend) => {
              const info = BACKEND_INFO[backend.id];
              if (!info) return null;

              return (
                <BackendCard
                  key={backend.id}
                  backend={backend}
                  info={info}
                  installing={installing === backend.id}
                  expanded={expandedInstall === backend.id}
                  onToggleExpand={() =>
                    setExpandedInstall(expandedInstall === backend.id ? null : backend.id)
                  }
                  onInstall={backend.id === "claude" ? handleInstallClaude : undefined}
                  onAuth={backend.id === "claude" ? handleAuthClaude : undefined}
                />
              );
            })
          )}
        </div>

        {/* Actions */}
        <div
          style={{
            marginTop: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={onDetect}
            disabled={detecting || checking}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              fontSize: "0.55rem",
              cursor: detecting ? "default" : "pointer",
              fontFamily: "inherit",
              padding: "0.3rem 0.6rem",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              opacity: detecting ? 0.5 : 1,
            }}
          >
            {detecting && (
              <span
                className="dot"
                style={{ background: "var(--text-muted)", animation: "pulse 1s ease-in-out infinite" }}
              />
            )}
            {detecting ? "Scanning..." : "Re-scan"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {anyAvailable && (
              <span style={{ fontSize: "0.5rem", color: "var(--green)" }}>
                {installedCount} engine{installedCount !== 1 ? "s" : ""} ready
              </span>
            )}
            <button
              onClick={onContinue}
              disabled={!anyAvailable}
              style={{
                ...primaryBtn,
                opacity: anyAvailable ? 1 : 0.3,
                cursor: anyAvailable ? "pointer" : "default",
              }}
            >
              Continue
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "1.25rem",
            textAlign: "center",
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          You can add more engines later from within the cockpit.
        </div>
      </div>
    </div>
  );
}

/* =====================
   Backend Card
   ===================== */

function BackendCard({
  backend,
  info,
  installing,
  expanded,
  onToggleExpand,
  onInstall,
  onAuth,
}: {
  backend: BackendStatus;
  info: { description: string; installHint: string; authCommand?: string; icon: string };
  installing: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onInstall?: () => void;
  onAuth?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        border: `1px solid ${backend.installed ? "var(--green)" : "var(--border)"}`,
        borderRadius: 6,
        background: backend.installed ? "rgba(68,255,136,0.03)" : "var(--surface)",
        overflow: "hidden",
        transition: "all 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 0.65rem",
        }}
      >
        {/* Icon */}
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: `1px solid ${backend.installed ? "var(--green)" : "var(--border-light)"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.8rem",
            flexShrink: 0,
            color: backend.installed ? "var(--green)" : "var(--text-dim)",
          }}
        >
          {backend.installed ? "✓" : info.icon}
        </span>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>
              {backend.label}
            </span>
            {backend.installed && backend.version && (
              <span style={{ fontSize: "0.45rem", color: "var(--text-muted)" }}>
                {backend.version.substring(0, 30)}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "0.55rem",
              color: "var(--text-dim)",
              lineHeight: 1.4,
              marginTop: "0.1rem",
            }}
          >
            {info.description}
          </div>
        </div>

        {/* Status badge */}
        <span
          style={{
            fontSize: "0.5rem",
            fontWeight: 600,
            padding: "0.15rem 0.4rem",
            borderRadius: 3,
            flexShrink: 0,
            ...(backend.installed
              ? {
                  color: "var(--green)",
                  background: "rgba(68,255,136,0.1)",
                }
              : {
                  color: "var(--text-muted)",
                  background: "rgba(255,255,255,0.04)",
                }),
          }}
        >
          {backend.installed ? "READY" : "NOT FOUND"}
        </span>
      </div>

      {/* Actions for not-installed backends */}
      {!backend.installed && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "0.5rem 0.65rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            {/* One-click install (Claude only) */}
            {onInstall && (
              <button
                onClick={onInstall}
                disabled={installing}
                style={{
                  background: installing ? "var(--border)" : "var(--text)",
                  color: installing ? "var(--text-muted)" : "var(--bg)",
                  border: "none",
                  borderRadius: 4,
                  padding: "0.25rem 0.6rem",
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  cursor: installing ? "default" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                {installing && (
                  <span
                    className="dot"
                    style={{ background: "var(--text-muted)", animation: "pulse 1s ease-in-out infinite" }}
                  />
                )}
                {installing ? "Installing..." : "Install"}
              </button>
            )}

            {/* Show install command */}
            <button
              onClick={onToggleExpand}
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text-muted)",
                fontSize: "0.55rem",
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "0.25rem 0.5rem",
              }}
            >
              {expanded ? "Hide" : "Install manually"}
            </button>
          </div>

          {/* Expanded install instructions */}
          {expanded && (
            <div
              style={{
                marginTop: "0.4rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "0.35rem 0.5rem",
                gap: "0.5rem",
              }}
            >
              <code
                style={{
                  fontSize: "0.55rem",
                  color: "var(--green)",
                  fontFamily: "inherit",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                $ {info.installHint}
              </code>
              <button
                onClick={() => copy(info.installHint)}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  color: copied ? "var(--green)" : "var(--text-muted)",
                  fontSize: "0.45rem",
                  padding: "0.1rem 0.3rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Auth action for Claude (installed but may need auth) */}
      {backend.installed && onAuth && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "0.4rem 0.65rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>
            Uses your Claude subscription
          </span>
          <button
            onClick={onAuth}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-dim)",
              fontSize: "0.5rem",
              cursor: "pointer",
              fontFamily: "inherit",
              padding: "0.15rem 0.4rem",
            }}
          >
            Re-authenticate
          </button>
        </div>
      )}
    </div>
  );
}

/* =====================
   Ready Screen
   ===================== */

function ReadyScreen({
  detection,
  onEnter,
}: {
  detection: DetectionResult | null;
  onEnter: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const installed = detection?.backends.filter((b) => b.installed) || [];

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        ...fullscreen,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease-in",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2px solid var(--green)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
            fontSize: "1.2rem",
            color: "var(--green)",
          }}
        >
          &#10003;
        </div>

        <div
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
          }}
        >
          Engines ready
        </div>

        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--text-dim)",
            lineHeight: 1.6,
            marginBottom: "0.75rem",
          }}
        >
          {installed.length === 1
            ? `${installed[0].label} is connected. You can add more engines later.`
            : `${installed.map((b) => b.label).join(", ")} are connected.`}
        </div>

        {/* Show installed badges */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.4rem",
            marginBottom: "1.5rem",
          }}
        >
          {installed.map((b) => (
            <span
              key={b.id}
              style={{
                fontSize: "0.5rem",
                fontWeight: 600,
                color: "var(--green)",
                background: "rgba(68,255,136,0.08)",
                border: "1px solid rgba(68,255,136,0.2)",
                borderRadius: 4,
                padding: "0.2rem 0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <span className="dot dot-green" style={{ width: 4, height: 4 }} />
              {b.label}
            </span>
          ))}
        </div>

        <button onClick={onEnter} style={primaryBtn}>
          Enter cockpit
        </button>
      </div>
    </div>
  );
}

/* =====================
   Shared styles
   ===================== */

const fullscreen: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "var(--bg)",
  padding: "2rem",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--text)",
  color: "var(--bg)",
  border: "none",
  borderRadius: 6,
  padding: "0.5rem 1.5rem",
  fontSize: "0.7rem",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
  transition: "opacity 0.15s",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.55rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "0.5rem",
};
