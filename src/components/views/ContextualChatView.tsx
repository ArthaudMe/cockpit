"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "../ui/ChatMessage";
import { usePersistedState } from "@/lib/use-persisted-state";
import { streamChat } from "@/lib/chat-client";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export type ContextFocus = {
  title: string;
  subtitle?: string;
  source: string;
  icon: string;
  data: Record<string, string | number | boolean | null>[];
  suggestedQuestions: string[];
  systemContext: string;
};

function ToolResult({ focus }: { focus: ContextFocus }) {
  return (
    <div className="agent-tool-result">
      <div className="agent-tool-header">
        <span style={{ color: "var(--blue)", fontSize: "0.65rem", fontWeight: 600 }}>
          ⎔ context_loaded
        </span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>
          {focus.source.toLowerCase()}
        </span>
      </div>
      <div className="agent-tool-body">
        {focus.data.map((row, i) => (
          <div key={i} className="agent-tool-row">
            {Object.entries(row).map(([key, val]) => (
              <span key={key} style={{ display: "inline-block", marginRight: "0.8rem" }}>
                <span style={{ color: "var(--text-muted)" }}>{key}</span>
                <span style={{ color: "var(--text-dim)", margin: "0 0.2rem" }}>=</span>
                <span style={{ color: "var(--green)" }}>{val == null ? "—" : String(val)}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentThinking() {
  return (
    <div className="agent-thinking">
      <span className="agent-thinking-dots">
        <span className="agent-thinking-dot" />
        <span className="agent-thinking-dot" style={{ animationDelay: "0.2s" }} />
        <span className="agent-thinking-dot" style={{ animationDelay: "0.4s" }} />
      </span>
      <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
        Claude is thinking...
      </span>
    </div>
  );
}

export function ContextualChatView({
  focus,
  onBack,
  claudeConnected,
  agentId,
}: {
  focus: ContextFocus;
  onBack: () => void;
  claudeConnected: boolean;
  agentId?: string | null;
}) {
  const focusKey = `cockpit-focus-${focus.source}-${focus.title}`.slice(0, 100);
  const [messages, setMessages] = usePersistedState<Message[]>(focusKey, []);
  const [streaming, setStreaming] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Abort any in-flight stream when the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC key to go back
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !streaming) {
        onBack();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onBack, streaming]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = (text || inputValue).trim();
      if (!msg || streaming) return;

      setInputValue("");
      const userMsg: Message = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const chatUrl = agentId ? `/api/agents/${agentId}/chat` : "/api/chat";
        const result = await streamChat({
          url: chatUrl,
          body: {
            message: msg,
            focusContext: focus.systemContext,
          },
          signal: controller.signal,
          onChunk: (_full, delta) => {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + delta };
              return next;
            });
          },
        });

        if (!result.ok) {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              role: "assistant",
              content: result.status >= 500 ? "Something went wrong. Please try again in a moment."
                      : "Sorry, I couldn't process that request. Please try again.",
            };
            return next;
          });
          setStreaming(false);
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: err instanceof Error && err.message.includes("Failed to fetch")
                    ? "Couldn't reach the server. Please check your connection and try again."
                    : "Something unexpected happened. Please try again.",
          };
          return next;
        });
      }

      setStreaming(false);
    },
    [inputValue, streaming, focus.systemContext, agentId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="agent-container">
      {/* Agent header bar */}
      <div className="agent-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button onClick={onBack} className="agent-back-btn">
            ESC
          </button>
          <div className="agent-breadcrumb">
            <span style={{ color: "var(--text-muted)" }}>claude</span>
            <span style={{ color: "var(--text-muted)", margin: "0 0.2rem" }}>/</span>
            <span style={{ color: "var(--blue)" }}>{focus.source.toLowerCase()}</span>
            <span style={{ color: "var(--text-muted)", margin: "0 0.2rem" }}>/</span>
            <span style={{ color: "var(--text)" }}>
              {focus.title.length > 40 ? focus.title.slice(0, 40) + "…" : focus.title}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "inherit" }}>
            {claudeConnected ? "claude-code" : "disconnected"}
          </span>
          <span
            className="dot"
            style={{
              background: claudeConnected ? "var(--green)" : "var(--red)",
              ...(claudeConnected ? { animation: "pulse 3s ease-in-out infinite" } : {}),
            }}
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="agent-content">
        {/* Tool result showing the loaded context */}
        <ToolResult focus={focus} />

        {/* Subtitle / meta */}
        {focus.subtitle && (
          <div style={{ fontSize: "0.65rem", color: "var(--text-dim)", marginBottom: "0.6rem", paddingLeft: "0.2rem" }}>
            {focus.subtitle}
          </div>
        )}

        {/* Suggested actions as slash-commands */}
        {messages.length === 0 && (
          <div className="agent-suggestions">
            {focus.suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={!claudeConnected}
                className="agent-suggestion-btn"
              >
                <span style={{ color: "var(--blue)", marginRight: "0.3rem" }}>›</span>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div key={i} className="agent-message-wrapper">
            {msg.role === "user" ? (
              <div className="agent-user-msg">
                <span className="agent-prompt-indicator">❯</span>
                <span>{msg.content}</span>
              </div>
            ) : (
              <div className="agent-assistant-msg">
                {msg.content ? (
                  <ChatMessage message={msg} />
                ) : (
                  streaming && i === messages.length - 1 && <AgentThinking />
                )}
              </div>
            )}
          </div>
        ))}

        {streaming && messages.length > 0 && messages[messages.length - 1].content && (
          <div style={{ padding: "0.2rem 0" }}>
            <span
              className="agent-cursor-blink"
              style={{ display: "inline-block", width: 6, height: 12, background: "var(--accent)", marginLeft: 2 }}
            />
          </div>
        )}
      </div>

      {/* Input area — terminal style */}
      <div className="agent-input-area">
        <div className="agent-input-row">
          <span className="agent-prompt-indicator" style={{ flexShrink: 0 }}>❯</span>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              claudeConnected
                ? "Ask a question..."
                : "Claude CLI not connected"
            }
            disabled={!claudeConnected}
            rows={1}
            className="agent-input"
          />
          <button
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || streaming || !claudeConnected}
            className="agent-send-btn"
            style={{
              opacity: inputValue.trim() && claudeConnected ? 1 : 0.3,
            }}
          >
            ⏎
          </button>
        </div>
        <div className="agent-input-hints">
          <span>enter to send</span>
          <span>shift+enter for newline</span>
          <span>esc to go back</span>
        </div>
      </div>
    </div>
  );
}
