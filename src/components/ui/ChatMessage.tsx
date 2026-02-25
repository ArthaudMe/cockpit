"use client";

import { parseResponse } from "@/lib/parser";
import { RenderTable } from "../renderers/Table";
import { RenderBarChart } from "../renderers/BarChart";
import { RenderCardGrid } from "../renderers/CardGrid";

type Message = {
  role: "user" | "assistant";
  content: string;
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
        <blockquote key={i} style={{ borderLeft: "2px solid var(--border-light)", paddingLeft: "0.6em", margin: "0.4em 0", color: "var(--text-dim)" }}>
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
      elements.push(<p key={i} style={{ margin: "0.3em 0", lineHeight: 1.5, fontSize: "0.7rem" }}>{inlineFormat(line)}</p>);
    }

    i++;
  }

  return <>{elements}</>;
}

export function ChatMessage({ message }: { message: Message }) {
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
          {message.content}
        </div>
      </div>
    );
  }

  const segments = parseResponse(message.content);

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div style={{ maxWidth: "90%" }}>
        {segments.map((seg, i) => {
          if (seg.type === "render") {
            const block = seg.block;
            switch (block.mio_render) {
              case "table":
                return <RenderTable key={i} title={block.title} columns={block.columns} rows={block.rows} />;
              case "bar_chart":
                return <RenderBarChart key={i} title={block.title} data={block.data} />;
              case "card_grid":
                return <RenderCardGrid key={i} title={block.title} cards={block.cards} />;
              default:
                return null;
            }
          }

          return (
            <div key={i} style={{ color: "var(--text)" }}>
              <SimpleMarkdown content={seg.content} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
