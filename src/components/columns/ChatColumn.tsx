"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Context } from "@/lib/context";
import { ChatMessage } from "../ui/ChatMessage";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatColumn({
  context,
  inputValue,
  onInputChange,
  claudeConnected,
}: {
  context: Context;
  inputValue: string;
  onInputChange: (v: string) => void;
  claudeConnected: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversationId] = useState(() => generateId());
  const [restored, setRestored] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore messages from persistence on mount
  useEffect(() => {
    if (restored) return;
    setRestored(true);

    fetch(`/api/messages?conversationId=${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role,
              content: m.content,
            })),
          );
        }
      })
      .catch(() => {
        // Ignore — fresh session
      });
  }, [conversationId, restored]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (inputValue && inputRef.current) {
      inputRef.current.focus();
    }
  }, [inputValue]);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || streaming) return;

    onInputChange("");
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: `Error: ${res.status} ${res.statusText}`,
          };
          return next;
        });
        setStreaming(false);
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
          content: `Error: ${err instanceof Error ? err.message : "Unknown error"}. Is Claude CLI installed?`,
        };
        return next;
      });
    }

    setStreaming(false);
  }, [inputValue, streaming, onInputChange, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="panel"
      style={{ height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 }}
    >
      {/* Chat header */}
      <div className="panel-header" style={{ cursor: "default" }}>
        <div className="panel-title-row">
          <span className="panel-title">Agent</span>
          <span className="tag tag-dim">claude code</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span
            className="dot"
            style={{ background: claudeConnected ? "var(--green)" : "var(--red)" }}
          />
          <span style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>
            {claudeConnected ? "ready" : "disconnected"}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.75rem",
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--text-dim)",
                textAlign: "center",
              }}
            >
              Good morning, {context.user}
            </div>
            <div
              style={{
                fontSize: "0.55rem",
                color: "var(--text-muted)",
                textAlign: "center",
                maxWidth: "80%",
              }}
            >
              Click anything in the panels, or ask about your projects, calendar, metrics, or team.
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "0.35rem",
                marginTop: "0.5rem",
              }}
            >
              {[
                "Prep me for today's meetings",
                "Status across all projects?",
                "Compare our competitors",
                "What should I focus on today?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => onInputChange(q)}
                  style={{
                    background: "var(--surface-hover)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "0.25rem 0.5rem",
                    fontSize: "0.55rem",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {streaming && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.25rem 0",
            }}
          >
            <span
              className="dot dot-green"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <span style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>
              thinking...
            </span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "0.35rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "0.4rem 0.5rem",
          }}
        >
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              claudeConnected
                ? "Ask anything about your work..."
                : "Claude CLI not connected..."
            }
            disabled={!claudeConnected}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: "0.7rem",
              fontFamily: "inherit",
              maxHeight: 100,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || streaming || !claudeConnected}
            style={{
              background: inputValue.trim() && claudeConnected
                ? "var(--accent)"
                : "var(--border)",
              color: inputValue.trim() && claudeConnected ? "var(--bg)" : "var(--text-muted)",
              border: "none",
              borderRadius: 3,
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: inputValue.trim() && !streaming && claudeConnected ? "pointer" : "default",
              fontSize: "0.6rem",
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
