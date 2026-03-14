"use client";

import { useState, useEffect, useCallback } from "react";

type OnboardingStep = "welcome" | "install" | "authenticate" | "ready";

export function OnboardingView({
  onRetry,
  checking,
  error,
}: {
  onRetry: () => void;
  checking: boolean;
  error?: string;
}) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  // Auto-advance: when connection succeeds, go to ready
  useEffect(() => {
    if (!checking && !error && step === "authenticate") {
      setStep("ready");
    }
  }, [checking, error, step]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await fetch("/api/install-claude", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStep("authenticate");
      } else {
        setInstallError(data.error || "Installation failed. See manual steps below.");
      }
    } catch {
      setInstallError("Could not start installation. Check your internet connection.");
    } finally {
      setInstalling(false);
    }
  }, []);

  const handleAuthenticate = useCallback(async () => {
    try {
      await fetch("/api/authenticate-claude", { method: "POST" });
      // Give it a moment, then check connection
      setTimeout(() => onRetry(), 2000);
    } catch {
      // Auth opens browser — even if this fails, user might complete in browser
    }
  }, [onRetry]);

  if (step === "welcome") {
    return <WelcomeScreen onContinue={() => setStep("install")} />;
  }

  if (step === "ready") {
    return <ReadyScreen onEnter={onRetry} />;
  }

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
      <div style={{ maxWidth: 440, width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
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
            Connect your engine
          </div>
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-dim)",
              marginTop: "0.35rem",
              lineHeight: 1.5,
            }}
          >
            Cockpit runs on your Claude subscription.
            <br />
            No API keys, no usage fees — just your plan.
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {/* Step 1: Install */}
          <SetupCard
            number={1}
            title="Install Claude Code"
            active={step === "install"}
            done={step === "authenticate"}
          >
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--text-dim)",
                lineHeight: 1.6,
                marginBottom: "0.75rem",
              }}
            >
              Claude Code is the AI engine behind Cockpit.
              We&apos;ll install it for you.
            </div>

            {installError && (
              <div
                style={{
                  fontSize: "0.55rem",
                  color: "var(--red)",
                  background: "rgba(255,68,68,0.06)",
                  border: "1px solid rgba(255,68,68,0.15)",
                  borderRadius: 4,
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.75rem",
                  lineHeight: 1.5,
                }}
              >
                {installError}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <ActionButton
                onClick={handleInstall}
                loading={installing}
                label="Install"
                loadingLabel="Installing..."
              />
              <button
                onClick={() => setStep("authenticate")}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.55rem",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "0.25rem 0.4rem",
                }}
              >
                I already have it
              </button>
            </div>

            {/* Manual fallback — collapsed */}
            <ManualInstall />
          </SetupCard>

          {/* Step 2: Authenticate */}
          <SetupCard
            number={2}
            title="Sign in to Claude"
            active={step === "authenticate"}
            done={false}
          >
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--text-dim)",
                lineHeight: 1.6,
                marginBottom: "0.75rem",
              }}
            >
              This will open your browser. Sign in with your
              Claude account — Pro, Max, or Team.
            </div>

            {error && (
              <div
                style={{
                  fontSize: "0.55rem",
                  color: "var(--yellow)",
                  background: "rgba(255,170,0,0.06)",
                  border: "1px solid rgba(255,170,0,0.15)",
                  borderRadius: 4,
                  padding: "0.4rem 0.5rem",
                  marginBottom: "0.75rem",
                  lineHeight: 1.5,
                }}
              >
                Not connected yet. Sign in and come back here.
              </div>
            )}

            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <ActionButton
                onClick={handleAuthenticate}
                loading={checking}
                label="Sign in"
                loadingLabel="Checking..."
              />
              <button
                onClick={onRetry}
                disabled={checking}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  fontSize: "0.55rem",
                  cursor: checking ? "default" : "pointer",
                  fontFamily: "inherit",
                  padding: "0.25rem 0.5rem",
                  opacity: checking ? 0.5 : 1,
                }}
              >
                Check connection
              </button>
            </div>
          </SetupCard>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "1.5rem",
            textAlign: "center",
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
          }}
        >
          Need a Claude account?{" "}
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-dim)", textDecoration: "underline" }}
          >
            Sign up at claude.ai
          </a>
        </div>
      </div>
    </div>
  );
}

/* =====================
   Welcome Screen
   ===================== */

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
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
      <div
        style={{
          maxWidth: 400,
          width: "100%",
          textAlign: "center",
        }}
      >
        {/* Mark */}
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
          ◈
        </div>

        {/* Tagline */}
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
            marginBottom: "2rem",
            maxWidth: 300,
            margin: "0 auto 2rem",
          }}
        >
          See your situation. Make decisions.
          <br />
          Act with an AI co-pilot that knows your work.
        </div>

        {/* CTA */}
        <button
          onClick={onContinue}
          style={{
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
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Get started
        </button>

        {/* Sub */}
        <div
          style={{
            marginTop: "1rem",
            fontSize: "0.5rem",
            color: "var(--text-muted)",
          }}
        >
          Takes about 60 seconds
        </div>
      </div>
    </div>
  );
}

/* =====================
   Ready Screen
   ===================== */

function ReadyScreen({ onEnter }: { onEnter: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--bg)",
        padding: "2rem",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease-in",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {/* Check */}
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
          ✓
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
          You&apos;re connected
        </div>

        <div
          style={{
            fontSize: "0.65rem",
            color: "var(--text-dim)",
            lineHeight: 1.6,
            marginBottom: "1.5rem",
          }}
        >
          Claude is ready. Your cockpit is waiting.
        </div>

        <button
          onClick={onEnter}
          style={{
            background: "var(--text)",
            color: "var(--bg)",
            border: "none",
            borderRadius: 6,
            padding: "0.5rem 2rem",
            fontSize: "0.7rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "-0.01em",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Enter cockpit
        </button>
      </div>
    </div>
  );
}

/* =====================
   Sub-components
   ===================== */

function SetupCard({
  number,
  title,
  active,
  done,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? "var(--border-light)" : "var(--border)"}`,
        borderRadius: 6,
        background: active ? "rgba(255,255,255,0.015)" : "transparent",
        opacity: !active && !done ? 0.4 : 1,
        transition: "all 0.2s",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.65rem",
          borderBottom: active ? "1px solid var(--border)" : "none",
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.5rem",
            fontWeight: 700,
            flexShrink: 0,
            background: done
              ? "var(--green)"
              : active
                ? "var(--text)"
                : "var(--border)",
            color: done || active ? "var(--bg)" : "var(--text-muted)",
            transition: "all 0.2s",
          }}
        >
          {done ? "✓" : number}
        </span>
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            color: done
              ? "var(--text-dim)"
              : active
                ? "var(--text)"
                : "var(--text-muted)",
          }}
        >
          {title}
        </span>
        {done && (
          <span
            style={{
              fontSize: "0.5rem",
              color: "var(--green)",
              marginLeft: "auto",
              fontWeight: 600,
            }}
          >
            Done
          </span>
        )}
      </div>

      {/* Body */}
      {active && (
        <div style={{ padding: "0.65rem" }}>{children}</div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  label,
  loadingLabel,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        background: loading ? "var(--border)" : "var(--text)",
        color: loading ? "var(--text-muted)" : "var(--bg)",
        border: "none",
        borderRadius: 4,
        padding: "0.3rem 0.8rem",
        fontSize: "0.6rem",
        fontWeight: 700,
        cursor: loading ? "default" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        transition: "all 0.15s",
      }}
    >
      {loading && (
        <span
          className="dot"
          style={{
            background: "var(--text-muted)",
            animation: "pulse 1s ease-in-out infinite",
          }}
        />
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}

function ManualInstall() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const cmd = "curl -fsSL https://claude.ai/install.sh | bash";

  const copy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ marginTop: "0.6rem" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          fontSize: "0.5rem",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          display: "flex",
          alignItems: "center",
          gap: "0.25rem",
        }}
      >
        <span
          style={{
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            fontSize: "0.45rem",
          }}
        >
          ▶
        </span>
        Install manually
      </button>
      {open && (
        <div
          style={{
            marginTop: "0.35rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface)",
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
            }}
          >
            $ {cmd}
          </code>
          <button
            onClick={copy}
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
  );
}
