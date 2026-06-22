"use client";

import { useState } from "react";
import type { ActionBlock, ActionResult } from "@/lib/actions/types";

const ACTION_LABELS: Record<string, string> = {
  linear_create_issue: "Create Linear Issue",
  github_comment_pr: "Comment on PR",
  slack_send_message: "Send Slack Message",
  calendar_create_event: "Create Calendar Event",
  gmail_draft: "Create Gmail Draft",
  notion_update_page: "Update Notion Page",
};

function formatParamKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatParamValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function ActionCard({
  action,
  onExecute,
  onCancel,
}: {
  action: ActionBlock;
  onExecute: () => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const [state, setState] = useState<"pending" | "loading" | "success" | "error">("pending");
  const [result, setResult] = useState<ActionResult | null>(null);

  const label = ACTION_LABELS[action.cockpit_action] || action.cockpit_action;
  const params = action.params || {};
  const paramEntries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null
  );

  async function handleExecute() {
    setState("loading");
    try {
      const res = await onExecute();
      setResult(res);
      setState(res.success ? "success" : "error");
    } catch (err) {
      setResult({ success: false, message: "Something went wrong. Please try again." });
      setState("error");
    }
  }

  return (
    <div
      style={{
        margin: "0.4rem 0",
        border: `1px solid ${state === "success" ? "var(--accent)" : state === "error" ? "var(--red)" : "var(--border-light)"}`,
        borderRadius: 6,
        padding: "0.6rem 0.75rem",
        background: "var(--surface)",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: "0.65rem",
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "0.4rem",
        }}
      >
        {label}
      </div>

      {/* Params */}
      {paramEntries.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.2rem",
            marginBottom: "0.5rem",
          }}
        >
          {paramEntries.map(([key, value]) => (
            <div
              key={key}
              style={{
                display: "flex",
                gap: "0.4rem",
                fontSize: "0.68rem",
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  color: "var(--text-muted)",
                  minWidth: "5rem",
                  flexShrink: 0,
                  fontWeight: 500,
                }}
              >
                {formatParamKey(key)}
              </span>
              <span
                style={{
                  color: "var(--text)",
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                }}
              >
                {formatParamValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Result message */}
      {result && (
        <div
          style={{
            fontSize: "0.65rem",
            padding: "0.35rem 0.5rem",
            borderRadius: 4,
            marginBottom: "0.4rem",
            background: result.success ? "color-mix(in srgb, var(--green) 10%, transparent)" : "color-mix(in srgb, var(--red) 10%, transparent)",
            color: result.success ? "var(--green)" : "var(--red)",
            lineHeight: 1.5,
          }}
        >
          {result.message}
          {result.url && (
            <>
              {" "}
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "underline" }}
              >
                Open
              </a>
            </>
          )}
        </div>
      )}

      {/* Buttons */}
      {state === "pending" && (
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            onClick={handleExecute}
            style={{
              background: "var(--accent)",
              color: "var(--bg)",
              border: "none",
              borderRadius: 4,
              padding: "0.25rem 0.6rem",
              fontSize: "0.65rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Execute
          </button>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "0.25rem 0.6rem",
              fontSize: "0.65rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {state === "loading" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.65rem",
            color: "var(--text-muted)",
          }}
        >
          <span
            className="dot"
            style={{
              background: "var(--accent)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
          Executing...
        </div>
      )}
    </div>
  );
}
