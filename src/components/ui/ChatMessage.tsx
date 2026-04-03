"use client";

import { parseResponse } from "@/lib/parser";
import { SKILLS } from "@/lib/skills-defs";
import { RenderBlockRenderer } from "../renderers/RenderBlockRenderer";
import { ActionCard } from "./ActionCard";
import { FileChip } from "./FileChip";
import type { SubagentSuggestion, ActionBlock } from "@/lib/parser";
import type { ContextFocus } from "../views/ContextualChatView";

// Match file paths like src/lib/foo.ts, ./bar/baz.tsx, /abs/path.js, with optional :lineNumber
const FILE_PATH_RE = /(?:^|\s)((?:\/|\.\/|\.\.\/|[a-zA-Z][\w-]*\/)[^\s:,;'")\]}>]+\.[a-zA-Z]{1,10}(?::(\d+))?)(?=[\s,;:'")\]}>]|$)/g;

type Message = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
};

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  function inlineFormat(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(text.slice(lastIdx, match.index));
      }
      const m = match[0];
      if (m.startsWith("`")) {
        parts.push(
          <code key={match.index} style={{ background: "var(--border)", padding: "0.1em 0.3em", borderRadius: 3, fontSize: "0.9em" }}>
            {m.slice(1, -1)}
          </code>
        );
      } else if (m.startsWith("**")) {
        parts.push(<strong key={match.index}>{m.slice(2, -2)}</strong>);
      } else if (m.startsWith("*")) {
        parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
      } else if (m.startsWith("[")) {
        const linkMatch = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a key={match.index} href={linkMatch[2]} style={{ color: "var(--accent)" }}>
              {linkMatch[1]}
            </a>
          );
        }
      }
      lastIdx = match.index + m.length;
    }
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} style={{ fontSize: "0.75rem", fontWeight: 600, margin: "0.6em 0 0.2em", color: "var(--text)" }}>{inlineFormat(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0.6em 0 0.2em", color: "var(--text)" }}>{inlineFormat(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} style={{ fontSize: "0.85rem", fontWeight: 600, margin: "0.6em 0 0.2em", color: "var(--text)" }}>{inlineFormat(line.slice(2))}</h1>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} style={{ borderLeft: "2px solid var(--border-light)", paddingLeft: "0.6em", margin: "0.4em 0", color: "var(--text-dim)", overflowWrap: "break-word" }}>
          {inlineFormat(line.slice(2))}
        </blockquote>
      );
    } else if (line.match(/^[-*] /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(<li key={i}>{inlineFormat(lines[i].replace(/^[-*] /, ""))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} style={{ paddingLeft: "1.2em", margin: "0.3em 0", fontSize: "0.7rem" }}>{items}</ul>);
      continue;
    } else if (line.match(/^\d+\. /)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        items.push(<li key={i}>{inlineFormat(lines[i].replace(/^\d+\. /, ""))}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} style={{ paddingLeft: "1.2em", margin: "0.3em 0", fontSize: "0.7rem" }}>{items}</ol>);
      continue;
    } else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "0.6em", borderRadius: 4, overflow: "auto", margin: "0.4em 0", fontSize: "0.65rem" }}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
    } else if (line.trim() === "") {
      // skip
    } else {
      elements.push(<p key={i} style={{ margin: "0.3em 0", lineHeight: 1.5, fontSize: "0.7rem", overflowWrap: "break-word", wordBreak: "break-word" }}>{inlineFormat(line)}</p>);
    }

    i++;
  }

  return <>{elements}</>;
}

function extractFileRefs(text: string): { path: string; line?: number }[] {
  const refs: { path: string; line?: number }[] = [];
  const seen = new Set<string>();
  let match;
  const re = new RegExp(FILE_PATH_RE.source, "g");
  while ((match = re.exec(text)) !== null) {
    const raw = match[1].trim();
    // Split off optional :lineNumber
    const colonIdx = raw.lastIndexOf(":");
    let filePath = raw;
    let line: number | undefined;
    if (colonIdx > 0) {
      const afterColon = raw.slice(colonIdx + 1);
      if (/^\d+$/.test(afterColon)) {
        filePath = raw.slice(0, colonIdx);
        line = parseInt(afterColon, 10);
      }
    }
    const key = filePath + (line ? `:${line}` : "");
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ path: filePath, line });
    }
  }
  return refs;
}

async function executeActionRequest(action: ActionBlock) {
  const res = await fetch("/api/actions/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cockpit_action: action.cockpit_action,
      params: action.params,
    }),
  });
  return res.json();
}

export function ChatMessage({
  message,
  onApproveSubagent,
  onOpenFile,
  onOpenFocus,
}: {
  message: Message;
  onApproveSubagent?: (suggestion: SubagentSuggestion) => void;
  onOpenFile?: (path: string) => void;
  onOpenFocus?: (focus: ContextFocus) => void;
}) {
  if (message.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <div
          style={{
            maxWidth: "75%",
            background: "var(--accent)",
            color: "var(--bg)",
            padding: "0.4rem 0.6rem",
            borderRadius: "4px 4px 1px 4px",
            fontSize: "0.7rem",
            lineHeight: 1.4,
          }}
        >
          {message.images && message.images.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "0.3rem",
                flexWrap: "wrap",
                marginBottom: message.content ? "0.35rem" : 0,
              }}
            >
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt=""
                  style={{
                    maxWidth: 180,
                    maxHeight: 140,
                    borderRadius: 3,
                    objectFit: "cover",
                    border: "1px solid rgba(0,0,0,0.15)",
                  }}
                />
              ))}
            </div>
          )}
          {message.content}
        </div>
      </div>
    );
  }

  const segments = parseResponse(message.content);
  const fileRefs = onOpenFile ? extractFileRefs(message.content) : [];

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ maxWidth: "90%", overflowWrap: "break-word", wordBreak: "break-word" }}>
        {segments.map((seg, i) => {
          if (seg.type === "skill_active") {
            const skill = SKILLS.find((s) => s.slash === seg.skillSlash);
            return (
              <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", borderRadius: 3, padding: "0.15rem 0.45rem", marginBottom: "0.4rem", fontSize: "0.5rem", color: "var(--accent)", fontWeight: 600 }}>
                <span>{skill?.icon || "◆"}</span>
                {skill?.name || seg.skillSlash}
              </div>
            );
          }

          if (seg.type === "subagent_suggestion") {
            const s = seg.suggestion;
            return (
              <div key={i} style={{ margin: "0.4rem 0", border: "1px solid var(--border-light)", borderRadius: 6, padding: "0.6rem 0.75rem", background: "var(--surface)" }}>
                <div style={{ fontSize: "0.5rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>Suggested subagent</div>
                <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.15rem" }}>
                  {s.name}
                  <span style={{ fontSize: "0.45rem", background: "rgba(255,255,255,0.06)", padding: "0.1rem 0.3rem", borderRadius: 3, color: "var(--text-muted)", marginLeft: "0.4rem", fontWeight: 400 }}>{s.role}</span>
                </div>
                <div style={{ fontSize: "0.55rem", color: "var(--text-dim)", marginBottom: "0.5rem", lineHeight: 1.4 }}>{s.task}</div>
                {onApproveSubagent && (
                  <button onClick={() => onApproveSubagent(s)} style={{ background: "var(--accent)", color: "var(--bg)", border: "none", borderRadius: 4, padding: "0.25rem 0.6rem", fontSize: "0.5rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Spawn agent
                  </button>
                )}
              </div>
            );
          }

          if (seg.type === "loading") {
            return (
              <div
                key={i}
                style={{
                  margin: "0.4rem 0",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: "0.75rem",
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span
                  className="dot"
                  style={{
                    background: "var(--accent)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.55rem",
                    color: "var(--text-muted)",
                    fontFamily: "inherit",
                    letterSpacing: "0.03em",
                  }}
                >
                  Rendering visual...
                </span>
              </div>
            );
          }

          if (seg.type === "render") {
            return (
              <RenderBlockRenderer
                key={i}
                block={seg.block}
                onItemClick={
                  onOpenFocus
                    ? (source, data) => {
                        const title = data.title || data.label || `${source} item`;
                        const subtitle = data.subtitle || data.status;
                        const focusData: Record<string, string | number | boolean | null>[] = [];
                        const row = data.row as string[] | undefined;
                        const columns = data.columns as string[] | undefined;
                        if (row && columns) {
                          const record: Record<string, string | number | boolean | null> = {};
                          columns.forEach((col: string, ci: number) => {
                            record[col] = row[ci] ?? null;
                          });
                          focusData.push(record);
                        } else {
                          const { rowIndex, barIndex, cardIndex, columns: _c, row: _r, ...rest } = data;
                          focusData.push(rest as Record<string, string | number | boolean | null>);
                        }
                        onOpenFocus({
                          title: String(title),
                          subtitle: subtitle ? String(subtitle) : undefined,
                          source,
                          icon: source === "table" ? "▦" : source === "bar_chart" ? "▥" : "◫",
                          data: focusData,
                          suggestedQuestions: [
                            `Tell me more about ${title}`,
                            `What are the key details?`,
                            `How does this compare to others?`,
                          ],
                          systemContext: `The user clicked on a ${source} item: ${JSON.stringify(data)}. Focus your answers on this specific item.`,
                        });
                      }
                    : undefined
                }
              />
            );
          }

          if (seg.type === "action") {
            return (
              <ActionCard
                key={i}
                action={seg.action}
                onExecute={() => executeActionRequest(seg.action)}
                onCancel={() => {}}
              />
            );
          }

          return (
            <div key={i} style={{ color: "var(--text)" }}>
              <SimpleMarkdown content={seg.content} />
            </div>
          );
        })}

        {/* File reference chips */}
        {fileRefs.length > 0 && onOpenFile && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.2rem",
              marginTop: "0.3rem",
            }}
          >
            {fileRefs.map((ref, i) => (
              <FileChip
                key={i}
                path={ref.path}
                line={ref.line}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
