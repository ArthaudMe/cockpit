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

type OnboardingStep = "claude" | "datasources";

const CLAUDE_INSTALL_CMD = "curl -fsSL https://claude.ai/install.sh | bash";

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
  const [step, setStep] = useState<OnboardingStep>("claude");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [detecting, setDetecting] = useState(false);

  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/detect-backends");
      const data: DetectionResult = await res.json();
      setDetection(data);
    } catch {
      // detection failed
    } finally {
      setDetecting(false);
    }
  }, []);

  // Detect on mount, and keep re-checking until an engine is ready so the
  // screen advances on its own after an install/login finishes.
  useEffect(() => {
    if (step !== "claude") return;
    detect();
    if (detection?.anyAvailable) return;
    const interval = setInterval(detect, 5000);
    return () => clearInterval(interval);
  }, [step, detect, detection?.anyAvailable]);

  if (step === "datasources") {
    return <DatasourcesScreen onContinue={onRetry} />;
  }

  return (
    <ClaudeSetupScreen
      detection={detection}
      detecting={detecting}
      checking={checking}
      onDetect={detect}
      onContinue={() => setStep("datasources")}
    />
  );
}

/* =====================
   Step 1 — Claude Setup
   ===================== */

function ClaudeSetupScreen({
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
  const [installing, setInstalling] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);

  const claude = detection?.backends.find((b) => b.id === "claude");
  const others = (detection?.backends || []).filter(
    (b) => b.id !== "claude" && b.installed
  );
  const ready = detection?.anyAvailable || false;

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const res = await fetch("/api/install-claude", { method: "POST" });
      const data = await res.json();
      if (data.success) onDetect();
    } catch {
      // fail silently — manual instructions remain available
    } finally {
      setInstalling(false);
    }
  }, [onDetect]);

  const handleSignIn = useCallback(async () => {
    try {
      await fetch("/api/authenticate-claude", { method: "POST" });
      // Browser opens for login; the 5s detection loop picks up the result
    } catch {
      // auth opens browser
    }
  }, []);

  const copyCmd = () => {
    navigator.clipboard.writeText(CLAUDE_INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={fullscreen}>
      <div style={{ maxWidth: 640, width: "100%" }}>
        {/* Branding header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              border: "1px solid var(--border-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
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
              marginBottom: "0.4rem",
            }}
          >
            Pilot your company
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
            Cockpit is powered by Claude. One step and you&apos;re flying.
          </div>
        </div>

        {/* Claude card */}
        <div
          style={{
            border: `1px solid ${claude?.installed ? "var(--green)" : "var(--border-light)"}`,
            borderRadius: 8,
            background: claude?.installed ? "rgba(68,255,136,0.03)" : "var(--surface)",
            padding: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: `1px solid ${claude?.installed ? "var(--green)" : "var(--border-light)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.95rem",
                flexShrink: 0,
                color: claude?.installed ? "var(--green)" : "var(--text-dim)",
              }}
            >
              {claude?.installed ? "✓" : "◇"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                Claude
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>
                {claude?.installed
                  ? "Installed — uses your Claude subscription, no API keys needed."
                  : "Uses your Claude subscription — no API keys needed."}
              </div>
            </div>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                padding: "0.2rem 0.5rem",
                borderRadius: 4,
                flexShrink: 0,
                ...(claude?.installed
                  ? { color: "var(--green)", background: "rgba(68,255,136,0.1)" }
                  : { color: "var(--text-muted)", background: "rgba(255,255,255,0.04)" }),
              }}
            >
              {detecting && !detection
                ? "CHECKING..."
                : claude?.installed
                  ? "READY"
                  : "NOT FOUND"}
            </span>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginTop: "0.85rem" }}>
            {!claude?.installed ? (
              <>
                <button onClick={handleInstall} disabled={installing} style={primaryBtn}>
                  {installing ? "Installing..." : "Install Claude"}
                </button>
                <button
                  onClick={() => setShowManual(!showManual)}
                  style={secondaryBtn}
                >
                  {showManual ? "Hide" : "Install manually"}
                </button>
              </>
            ) : (
              <>
                <button onClick={handleSignIn} style={secondaryBtn}>
                  Sign in to Claude
                </button>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  Already signed in? Just continue.
                </span>
              </>
            )}
          </div>

          {showManual && !claude?.installed && (
            <div
              style={{
                marginTop: "0.6rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "0.45rem 0.6rem",
                gap: "0.5rem",
              }}
            >
              <code
                style={{
                  fontSize: "0.72rem",
                  color: "var(--green)",
                  fontFamily: "inherit",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                $ {CLAUDE_INSTALL_CMD}
              </code>
              <button onClick={copyCmd} style={{ ...secondaryBtn, flexShrink: 0 }}>
                {copied ? "copied" : "copy"}
              </button>
            </div>
          )}
        </div>

        {/* Other detected engines — informational only */}
        {others.length > 0 && (
          <div
            style={{
              marginTop: "0.6rem",
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            Also detected: {others.map((b) => b.label).join(", ")} — available in the model
            switcher.
          </div>
        )}

        {/* Continue */}
        <div
          style={{
            marginTop: "1.5rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <button
            onClick={onContinue}
            disabled={!ready || checking}
            style={{
              ...primaryBtn,
              padding: "0.5rem 1.6rem",
              opacity: ready ? 1 : 0.3,
              cursor: ready ? "pointer" : "default",
            }}
          >
            Continue
          </button>
          {!ready && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              {detecting ? "Checking for Claude..." : "Waiting for an engine to be ready"}
            </span>
          )}
        </div>

        {/* App screenshot */}
        <div
          style={{
            marginTop: "2rem",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <img
            src="/cockpit-screenshot.png"
            alt="Cockpit dashboard"
            style={{
              width: "100%",
              display: "block",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* =====================
   Step 2 — Datasources
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
    <div style={fullscreen}>
      <div style={{ maxWidth: 480, width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={labelStyle}>Cockpit — last step</div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Connect a tool
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              color: "var(--text-dim)",
              marginTop: "0.35rem",
              lineHeight: 1.5,
            }}
          >
            Pick one to start — you can add the rest anytime in Settings.
            <br />
            All data stays on your machine. Cockpit runs entirely locally and
            no one else, including us, can access your data or tokens.
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
            style={{ ...primaryBtn, padding: "0.5rem 1.6rem" }}
          >
            {connectedCount > 0 ? "Enter cockpit" : "Skip for now"}
          </button>
          {connectedCount > 0 && (
            <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
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
          fontSize: "0.75rem",
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
            fontSize: "0.78rem",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {datasource.name}
        </div>
        <div
          style={{
            fontSize: "0.72rem",
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
            fontSize: "0.72rem",
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
            fontSize: "0.72rem",
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
            fontSize: "0.72rem",
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
  padding: "0.35rem 0.9rem",
  fontSize: "0.78rem",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.01em",
  transition: "opacity 0.15s",
};

const secondaryBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: "0.3rem 0.6rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "0.5rem",
};
