"use client";

import { useState, useCallback } from "react";
import type { SkillProposal } from "@/lib/parser";

export function SkillProposalCard({
  proposal,
}: {
  proposal: SkillProposal;
}) {
  const [status, setStatus] = useState<"pending" | "saving" | "saved" | "error">("pending");
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/skills/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
      } else {
        setError(data.error || "Failed to save skill");
        setStatus("error");
      }
    } catch {
      setError("Request failed");
      setStatus("error");
    }
  }, [proposal]);

  const handleDismiss = useCallback(() => {
    setStatus("error"); // reuse error state to hide buttons
    setError("Dismissed");
  }, []);

  const actionLabel =
    proposal.action === "create"
      ? "Save Skill"
      : proposal.action === "update"
        ? "Update Skill"
        : "Delete Skill";

  return (
    <div
      style={{
        margin: "0.4rem 0",
        padding: "0.6rem",
        background: "rgba(139, 92, 246, 0.06)",
        border: "1px solid rgba(139, 92, 246, 0.2)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          marginBottom: "0.35rem",
        }}
      >
        <span style={{ fontSize: "0.75rem" }}>{proposal.icon || "★"}</span>
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text)" }}>
            {proposal.action === "delete" ? "Delete" : "New"} Skill: {proposal.name}
          </div>
          {proposal.slash && (
            <span
              style={{
                fontSize: "0.65rem",
                color: "rgba(139, 92, 246, 0.8)",
                fontWeight: 600,
              }}
            >
              {proposal.slash}
            </span>
          )}
        </div>
      </div>

      {proposal.description && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "0.3rem",
            lineHeight: 1.4,
          }}
        >
          {proposal.description}
        </div>
      )}

      {proposal.promptInstruction && proposal.action !== "delete" && (
        <details style={{ marginBottom: "0.35rem" }}>
          <summary
            style={{
              fontSize: "0.75rem",
              color: "var(--text-dim)",
              cursor: "pointer",
            }}
          >
            View prompt instruction
          </summary>
          <pre
            style={{
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              background: "rgba(0,0,0,0.2)",
              padding: "0.4rem",
              borderRadius: 4,
              marginTop: "0.2rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 120,
              overflow: "auto",
            }}
          >
            {proposal.promptInstruction}
          </pre>
        </details>
      )}

      {proposal.triggerHints && proposal.triggerHints.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.2rem",
            marginBottom: "0.35rem",
          }}
        >
          {proposal.triggerHints.map((hint) => (
            <span
              key={hint}
              style={{
                fontSize: "0.75rem",
                padding: "1px 5px",
                borderRadius: 3,
                background: "rgba(139, 92, 246, 0.1)",
                color: "rgba(139, 92, 246, 0.7)",
              }}
            >
              {hint}
            </span>
          ))}
        </div>
      )}

      {status === "pending" && (
        <div style={{ display: "flex", gap: "0.35rem" }}>
          <button
            onClick={handleSave}
            style={{
              background: "rgba(139, 92, 246, 0.15)",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: 4,
              color: "rgba(139, 92, 246, 0.9)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              fontWeight: 600,
              padding: "0.25rem 0.6rem",
            }}
          >
            {actionLabel}
          </button>
          <button
            onClick={handleDismiss}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.75rem",
              padding: "0.25rem 0.6rem",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {status === "saving" && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Saving...
        </span>
      )}

      {status === "saved" && (
        <span style={{ fontSize: "0.75rem", color: "var(--green)" }}>
          Skill saved — available immediately via {proposal.slash}
        </span>
      )}

      {status === "error" && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
