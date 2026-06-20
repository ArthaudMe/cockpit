"use client";

import { Component, type ReactNode } from "react";
import { track } from "@/lib/analytics";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    track("app_error", {
      errorType: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 1000),
      componentStack: info.componentStack?.slice(0, 500),
      context: "react",
    });

    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#0a0a0a",
            color: "#e8e8e8",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "-apple-system, 'Segoe UI', Ubuntu, sans-serif",
            padding: "2rem",
            zIndex: 99999,
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "1rem" }}>&#9670;</div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.75rem",
              color: "#888",
              maxWidth: 420,
              textAlign: "center",
              lineHeight: 1.5,
              marginBottom: "1.5rem",
            }}
          >
            Cockpit ran into an unexpected error. You can try reloading, or dismiss
            this screen to continue.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: "0.68rem",
                color: "#666",
                background: "#111",
                border: "1px solid #222",
                borderRadius: 6,
                padding: "0.75rem 1rem",
                maxWidth: 500,
                maxHeight: 120,
                overflow: "auto",
                marginBottom: "1.5rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={this.handleReload}
              style={{
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 6,
                padding: "0.5rem 1.25rem",
                fontSize: "0.7rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Reload
            </button>
            <button
              onClick={this.handleDismiss}
              style={{
                background: "transparent",
                color: "#888",
                border: "1px solid #333",
                borderRadius: 6,
                padding: "0.5rem 1.25rem",
                fontSize: "0.7rem",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
