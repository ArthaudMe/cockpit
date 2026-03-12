"use client";

import { useState } from "react";

export function OnboardingView({
  onRetry,
  checking,
  error,
}: {
  onRetry: () => void;
  checking: boolean;
  error?: string;
}) {
  const [step, setStep] = useState(0);

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
          maxWidth: 480,
          width: "100%",
        }}
      >
        {/* Logo / title */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            mio cockpit
          </div>
          <div
            style={{
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              marginTop: "0.25rem",
            }}
          >
            See your situation. Work with a context-aware agent.
          </div>
        </div>

        {/* Setup card */}
        <div
          className="panel"
          style={{ marginBottom: "0.75rem" }}
        >
          <div className="panel-header" style={{ cursor: "default" }}>
            <span className="panel-title">Setup</span>
            <span className="tag tag-yellow">required</span>
          </div>
          <div className="panel-content">
            <div
              style={{
                fontSize: "0.6rem",
                color: "var(--text-dim)",
                marginBottom: "0.75rem",
                lineHeight: 1.5,
              }}
            >
              This cockpit uses Claude Code as its AI engine. You need it
              installed and authenticated to get started.
            </div>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <SetupStep
                number={1}
                title="Install Claude Code"
                active={step === 0}
                done={step > 0}
                onClick={() => setStep(0)}
              >
                <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Run this in your terminal:
                </div>
                <CodeBlock text="npm install -g @anthropic-ai/claude-code" />
                <div style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  Requires Node.js 18+. Already installed? Skip to step 2.
                </div>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    marginTop: "0.4rem",
                    background: "var(--accent)",
                    color: "var(--bg)",
                    border: "none",
                    borderRadius: 3,
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.55rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Next
                </button>
              </SetupStep>

              <SetupStep
                number={2}
                title="Authenticate"
                active={step === 1}
                done={step > 1}
                onClick={() => setStep(1)}
              >
                <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Launch Claude Code once to log in:
                </div>
                <CodeBlock text="claude" />
                <div style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  This opens an auth flow in your browser. Once logged in, you
                  can close the terminal session.
                </div>
                <button
                  onClick={() => setStep(2)}
                  style={{
                    marginTop: "0.4rem",
                    background: "var(--accent)",
                    color: "var(--bg)",
                    border: "none",
                    borderRadius: 3,
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.55rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Next
                </button>
              </SetupStep>

              <SetupStep
                number={3}
                title="Connect"
                active={step === 2}
                done={false}
                onClick={() => setStep(2)}
              >
                <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", lineHeight: 1.5, marginBottom: "0.5rem" }}>
                  Click below to verify the connection. The cockpit will launch
                  once Claude Code is detected.
                </div>

                {error && (
                  <div
                    style={{
                      fontSize: "0.55rem",
                      color: "var(--red)",
                      background: "rgba(255,85,85,0.08)",
                      border: "1px solid rgba(255,85,85,0.2)",
                      borderRadius: 3,
                      padding: "0.35rem 0.5rem",
                      marginBottom: "0.5rem",
                      lineHeight: 1.4,
                    }}
                  >
                    Could not detect Claude Code. Make sure it&apos;s installed and
                    you&apos;ve run <code style={{ background: "var(--border)", padding: "0.1em 0.25em", borderRadius: 2 }}>claude</code> at
                    least once.
                  </div>
                )}

                <button
                  onClick={onRetry}
                  disabled={checking}
                  style={{
                    background: checking ? "var(--border)" : "var(--accent)",
                    color: checking ? "var(--text-muted)" : "var(--bg)",
                    border: "none",
                    borderRadius: 3,
                    padding: "0.3rem 0.8rem",
                    fontSize: "0.6rem",
                    fontWeight: 700,
                    cursor: checking ? "default" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  {checking ? (
                    <>
                      <span
                        className="dot"
                        style={{
                          background: "var(--text-muted)",
                          animation: "pulse 1s ease-in-out infinite",
                        }}
                      />
                      Checking...
                    </>
                  ) : (
                    "Check connection"
                  )}
                </button>
              </SetupStep>
            </div>
          </div>
        </div>

        {/* Quick start for devs */}
        <div
          style={{
            fontSize: "0.5rem",
            color: "var(--text-muted)",
            lineHeight: 1.6,
            textAlign: "center",
          }}
        >
          tl;dr:{" "}
          <code style={{ background: "var(--border)", padding: "0.1em 0.3em", borderRadius: 2 }}>
            npm i -g @anthropic-ai/claude-code && claude
          </code>
        </div>
      </div>
    </div>
  );
}

function SetupStep({
  number,
  title,
  active,
  done,
  onClick,
  children,
}: {
  number: number;
  title: string;
  active: boolean;
  done: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 4,
        overflow: "hidden",
        opacity: done && !active ? 0.5 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.4rem 0.5rem",
          cursor: "pointer",
          background: active ? "rgba(255,255,255,0.02)" : "transparent",
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.5rem",
            fontWeight: 700,
            flexShrink: 0,
            background: done ? "var(--green)" : active ? "var(--accent)" : "var(--border)",
            color: done || active ? "var(--bg)" : "var(--text-muted)",
          }}
        >
          {done ? "✓" : number}
        </span>
        <span
          style={{
            fontSize: "0.6rem",
            fontWeight: 600,
            color: active ? "var(--text)" : "var(--text-dim)",
          }}
        >
          {title}
        </span>
      </div>
      {active && (
        <div style={{ padding: "0 0.5rem 0.5rem 2.2rem" }}>{children}</div>
      )}
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.35rem 0.5rem",
        marginTop: "0.3rem",
        gap: "0.5rem",
      }}
    >
      <code
        style={{
          fontSize: "0.6rem",
          color: "var(--green)",
          fontFamily: "inherit",
        }}
      >
        $ {text}
      </code>
      <button
        onClick={copy}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: 3,
          color: copied ? "var(--green)" : "var(--text-muted)",
          fontSize: "0.5rem",
          padding: "0.15rem 0.35rem",
          cursor: "pointer",
          fontFamily: "inherit",
          flexShrink: 0,
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
