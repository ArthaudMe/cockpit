"use client";

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { ChatMessage } from "../ui/ChatMessage";
import { usePersistedState } from "@/lib/use-persisted-state";
import { SKILLS, expandSlashCommand } from "@/lib/skills-defs";
import { track } from "@/lib/analytics";
import type { SubagentSuggestion } from "@/lib/parser";
import type { ContextFocus } from "../views/ContextualChatView";

type Message = {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // base64 data URLs
};

type AgentInfo = {
  id: string;
  name: string;
  role: string;
  backend: string;
  model: string;
  busy: boolean;
};

type BackendDef = {
  id: string;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
};

const BACKEND_ICONS: Record<string, string> = {
  claude: "◇",
  codex: "◆",
  ollama: "○",
};

// Cap per-agent history so state and localStorage don't grow unboundedly.
const MAX_MESSAGES_PER_AGENT = 200;

// Strip base64 images before persisting — a few screenshots would blow
// through the ~5MB localStorage quota and silently kill persistence.
function stripImagesForPersist(byAgent: Record<string, Message[]>): Record<string, Message[]> {
  const out: Record<string, Message[]> = {};
  for (const [id, msgs] of Object.entries(byAgent)) {
    out[id] = msgs.map((m) => (m.images ? { role: m.role, content: m.content } : m));
  }
  return out;
}

export const ChatColumn = memo(function ChatColumn({
  inputValue,
  onInputChange,
  claudeConnected,
  onOpenFocus,
}: {
  inputValue: string;
  onInputChange: (v: string) => void;
  claudeConnected: boolean;
  onOpenFocus?: (focus: ContextFocus) => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [backends, setBackends] = useState<BackendDef[]>([]);
  const [activeAgentId, setActiveAgentId] = usePersistedState<string | null>(
    "cockpit-active-agent",
    null
  );
  const [messagesByAgent, setMessagesByAgent] = usePersistedState<
    Record<string, Message[]>
  >("cockpit-chat-agents", {}, { serialize: stripImagesForPersist });
  const [streamingAgents, setStreamingAgents] = useState<Set<string>>(new Set());
  const [notifiedAgents, setNotifiedAgents] = useState<Set<string>>(new Set());
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [renamingAgentId, setRenamingAgentId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [slashSelected, setSlashSelected] = useState(0);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Slash command autocomplete
  const slashMatches = useMemo(() => {
    const trimmed = inputValue.trim();
    if (!trimmed.startsWith("/")) return [];
    const parts = trimmed.split(" ");
    const query = parts[0].toLowerCase();
    // If the user already typed a full slash command + extra text, dismiss autocomplete
    if (parts.length > 1 && SKILLS.some((s) => s.slash === query)) return [];
    return SKILLS.filter((s) => s.slash.startsWith(query));
  }, [inputValue]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeAgentIdRef = useRef(activeAgentId);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    activeAgentIdRef.current = activeAgentId;
  }, [activeAgentId]);

  // Clear notification when switching to an agent
  useEffect(() => {
    if (activeAgentId) {
      setNotifiedAgents((prev) => {
        const next = new Set(prev);
        next.delete(activeAgentId);
        return next;
      });
    }
  }, [activeAgentId]);

  const loadAgentsAndBackends = useCallback(() => {
    setLoadError(false);
    Promise.all([
      fetch("/api/agents").then((r) => {
        if (!r.ok) throw new Error("Failed to load agents");
        return r.json();
      }),
      fetch("/api/backends").then((r) => {
        if (!r.ok) throw new Error("Failed to load backends");
        return r.json();
      }),
    ])
      .then(([agentsData, backendsData]: [AgentInfo[], BackendDef[]]) => {
        setAgents(agentsData);
        setBackends(backendsData);
        if (agentsData.length > 0 && !activeAgentId) {
          setActiveAgentId(agentsData[0].id);
        }
      })
      .catch(() => setLoadError(true));
  }, [activeAgentId, setActiveAgentId]);

  useEffect(() => {
    loadAgentsAndBackends();
  }, []);

  const messages = activeAgentId ? messagesByAgent[activeAgentId] || [] : [];
  const streaming = activeAgentId ? streamingAgents.has(activeAgentId) : false;

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

  const setMessagesFor = useCallback(
    (agentId: string, updater: (prev: Message[]) => Message[]) => {
      setMessagesByAgent((prev) => {
        const next = updater(prev[agentId] || []);
        return {
          ...prev,
          [agentId]:
            next.length > MAX_MESSAGES_PER_AGENT
              ? next.slice(-MAX_MESSAGES_PER_AGENT)
              : next,
        };
      });
    },
    [setMessagesByAgent]
  );

  const setMessages = useCallback(
    (updater: (prev: Message[]) => Message[]) => {
      if (!activeAgentId) return;
      setMessagesFor(activeAgentId, updater);
    },
    [activeAgentId, setMessagesFor]
  );

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    // Reset so the same file can be selected again
    e.target.value = "";
  }, []);

  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = useCallback(async (directText?: string) => {
    const text = (directText ?? inputValue).trim();
    const images = directText ? [] : pendingImages;
    if ((!text && images.length === 0) || streaming || !activeAgentId) return;

    const expansion = text ? expandSlashCommand(text) : null;
    const messageToSend = expansion ? expansion.expandedMessage : text;

    const targetAgentId = activeAgentId;
    onInputChange("");
    track("chat_message_sent");
    setPendingImages([]);
    setMessagesFor(targetAgentId, (prev) => [
      ...prev,
      { role: "user", content: text, ...(images.length > 0 ? { images } : {}) },
    ]);
    setStreamingAgents((prev) => new Set(prev).add(targetAgentId));
    setMessagesFor(targetAgentId, (prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`/api/agents/${targetAgentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageToSend,
          ...(images.length > 0 ? { images } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        setMessagesFor(targetAgentId, (prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: res.status === 503 ? "I'm having trouble connecting right now. Please check your internet connection and try again."
                    : res.status === 401 ? "Your session may have expired. Try reloading the app."
                    : res.status >= 500 ? "Something went wrong on my end. Please try again in a moment."
                    : "Sorry, I couldn't process that request. Please try again.",
          };
          return next;
        });
        setStreamingAgents((prev) => {
          const next = new Set(prev);
          next.delete(targetAgentId);
          return next;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessagesFor(targetAgentId, (prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      }
    } catch (err) {
      setMessagesFor(targetAgentId, (prev) => {
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

    setStreamingAgents((prev) => {
      const next = new Set(prev);
      next.delete(targetAgentId);
      return next;
    });
    // Notify if user switched away from this agent while it was working
    if (activeAgentIdRef.current !== targetAgentId) {
      setNotifiedAgents((prev) => new Set(prev).add(targetAgentId));
    }
  }, [inputValue, pendingImages, streaming, activeAgentId, onInputChange, setMessagesFor]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = e.dataTransfer?.files;
    if (!files) return;

    const hasImages = Array.from(files).some((f) => f.type.startsWith("image/"));
    if (!hasImages) return;

    e.preventDefault();
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setPendingImages((prev) => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash command autocomplete navigation
    if (slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelected((prev) => Math.min(prev + 1, slashMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelected((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        const match = slashMatches[slashSelected];
        if (match) {
          e.preventDefault();
          onInputChange(match.slash + " ");
          setSlashSelected(0);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onInputChange("");
        setSlashSelected(0);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      onInputChange(value.substring(0, start) + "\t" + value.substring(end));
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 1;
      });
    }
  };

  // "+" creates a working agent immediately — no form. Name and model are
  // edited inline afterwards (double-click tab to rename, switcher for model).
  const handleCreateAgent = useCallback(async () => {
    if (creatingAgent) return;
    setCreatingAgent(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Agent ${agents.length + 1}`, role: "general" }),
      });
      const agent: AgentInfo = await res.json();
      setAgents((prev) => [...prev, agent]);
      setActiveAgentId(agent.id);
    } catch {
      alert("Couldn't create the agent. Please try again.");
    } finally {
      setCreatingAgent(false);
    }
  }, [agents.length, creatingAgent, setActiveAgentId]);

  const handleRenameAgent = useCallback(
    async (id: string) => {
      const name = renameValue.trim();
      setRenamingAgentId(null);
      if (!name) return;
      try {
        const res = await fetch(`/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const updated: AgentInfo = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } catch {
        alert("Couldn't rename the agent. Please try again.");
      }
    },
    [renameValue]
  );

  const handleDeleteAgent = useCallback(
    async (id: string) => {
      if (!confirm("Delete this agent and its chat history?")) return;
      try {
        const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
      } catch {
        alert("Couldn't delete the agent. Please try again.");
        return;
      }
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setMessagesByAgent((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeAgentId === id) {
        const remaining = agents.filter((a) => a.id !== id);
        setActiveAgentId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [activeAgentId, agents, setActiveAgentId, setMessagesByAgent]
  );

  const handleApproveSubagent = useCallback(
    async (suggestion: SubagentSuggestion) => {
      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: suggestion.name, role: suggestion.role }),
        });
        const agent: AgentInfo = await res.json();
        setAgents((prev) => [...prev, agent]);
        setActiveAgentId(agent.id);

        setMessagesFor(agent.id, () => [
          { role: "user", content: suggestion.task },
          { role: "assistant", content: "" },
        ]);
        setStreamingAgents((prev) => new Set(prev).add(agent.id));

        const chatRes = await fetch(`/api/agents/${agent.id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: suggestion.task }),
        });

        if (!chatRes.ok || !chatRes.body) {
          setMessagesFor(agent.id, (prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: "Something went wrong starting this agent. Please try again." };
            return next;
          });
          setStreamingAgents((prev) => { const next = new Set(prev); next.delete(agent.id); return next; });
          return;
        }

        const reader = chatRes.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setMessagesFor(agent.id, (prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, content: last.content + chunk };
            return next;
          });
        }

        setStreamingAgents((prev) => { const next = new Set(prev); next.delete(agent.id); return next; });
        if (activeAgentIdRef.current !== agent.id) {
          setNotifiedAgents((prev) => new Set(prev).add(agent.id));
        }
      } catch (err) {
        console.error("[subagent] failed:", err);
      }
    },
    [setActiveAgentId, setMessagesFor]
  );

  const handleSwitchBackend = useCallback(
    async (backend: string, model: string) => {
      if (!activeAgentId) return;
      try {
        const res = await fetch(`/api/agents/${activeAgentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backend, model }),
        });
        const updated: AgentInfo = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setShowSwitcher(false);
      } catch {
        alert("Couldn't switch the backend. Please try again.");
      }
    },
    [activeAgentId]
  );

  const activeAgent = agents.find((a) => a.id === activeAgentId);

  const shortModel = (model: string) => {
    if (!model) return "AI";
    if (model.startsWith("claude-")) return model.split("-")[1];
    return model;
  };

  return (
    <div
      className="panel"
      style={{ height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 }}
    >
      {/* Agent tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          minHeight: "2rem",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flex: 1, overflowX: "auto", gap: 0 }}>
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setActiveAgentId(agent.id)}
              onDoubleClick={() => {
                setRenamingAgentId(agent.id);
                setRenameValue(agent.name);
              }}
              title="Double-click to rename"
              style={{
                background: agent.id === activeAgentId ? "var(--bg)" : "transparent",
                border: "none",
                borderRight: "1px solid var(--border)",
                padding: "0.35rem 0.6rem",
                fontSize: "0.75rem",
                fontWeight: agent.id === activeAgentId ? 600 : 400,
                color: agent.id === activeAgentId ? "var(--text)" : "var(--text-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                whiteSpace: "nowrap",
                transition: "all 0.1s",
              }}
            >
              <span
                className="dot"
                style={{
                  background: notifiedAgents.has(agent.id)
                    ? "var(--blue)"
                    : streamingAgents.has(agent.id)
                      ? "var(--yellow)"
                      : "var(--green)",
                  width: 5,
                  height: 5,
                  animation: streamingAgents.has(agent.id) ? "pulse 1s ease-in-out infinite" : undefined,
                }}
              />
              {renamingAgentId === agent.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRenameAgent(agent.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameAgent(agent.id);
                    if (e.key === "Escape") setRenamingAgentId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border-light)",
                    borderRadius: 3,
                    color: "var(--text)",
                    fontSize: "0.75rem",
                    fontFamily: "inherit",
                    outline: "none",
                    width: 90,
                    padding: "0 0.2rem",
                  }}
                />
              ) : (
                agent.name
              )}
              {notifiedAgents.has(agent.id) && (
                <span
                  style={{
                    fontSize: "0.75rem",
                    background: "var(--blue)",
                    color: "var(--bg)",
                    borderRadius: "50%",
                    width: 12,
                    height: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  !
                </span>
              )}
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {BACKEND_ICONS[agent.backend] || "◆"} {shortModel(agent.model)}
              </span>
              {agents.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAgent(agent.id);
                  }}
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    marginLeft: "0.15rem",
                    opacity: 0.5,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
                >
                  ×
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleCreateAgent}
          disabled={creatingAgent}
          style={{
            background: "none",
            border: "none",
            borderLeft: "1px solid var(--border)",
            padding: "0.35rem 0.5rem",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            cursor: creatingAgent ? "default" : "pointer",
            fontFamily: "inherit",
            flexShrink: 0,
            opacity: creatingAgent ? 0.5 : 1,
          }}
          title="New agent (double-click a tab to rename)"
        >
          +
        </button>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0.75rem" }}>
        {loadError && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Failed to load agents
            </span>
            <button
              onClick={loadAgentsAndBackends}
              style={{
                background: "none",
                border: "1px solid var(--border-light)",
                borderRadius: 4,
                color: "var(--text-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loadError && messages.length === 0 && activeAgent && (
          <EmptyState agent={activeAgent} onSend={sendMessage} />
        )}

        {!loadError && !activeAgent && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
            }}
          >
            Create an agent to get started
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} onApproveSubagent={handleApproveSubagent} onOpenFocus={onOpenFocus} />
        ))}

        {streaming && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0" }}>
            <span className="dot dot-green" style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>thinking...</span>
          </div>
        )}
      </div>

      {/* Input area with backend switcher */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "0.5rem", position: "relative" }}>
        {/* Slash command autocomplete */}
        {slashMatches.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 0.15rem)",
              left: "0.5rem",
              right: "0.5rem",
              background: "var(--surface)",
              border: "1px solid var(--border-light)",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              overflow: "hidden",
              zIndex: 101,
            }}
          >
            <div style={{ padding: "0.35rem 0.5rem", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Skills — Tab to select
            </div>
            {slashMatches.map((skill, idx) => (
              <button
                key={skill.id}
                onClick={() => { onInputChange(skill.slash + " "); setSlashSelected(0); inputRef.current?.focus(); }}
                onMouseEnter={() => setSlashSelected(idx)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.6rem",
                  background: idx === slashSelected ? "color-mix(in srgb, var(--text) 6%, transparent)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: "0.75rem", width: 16, textAlign: "center" }}>{skill.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text)", fontWeight: 500 }}>
                    {skill.slash}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400, marginLeft: "0.4rem" }}>{skill.name}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "0.1rem" }}>{skill.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Backend switcher popover */}
        {showSwitcher && activeAgent && (
          <BackendSwitcher
            backends={backends}
            currentBackend={activeAgent.backend}
            currentModel={activeAgent.model}
            onSelect={handleSwitchBackend}
            onClose={() => setShowSwitcher(false)}
          />
        )}

        {/* Image previews */}
        {pendingImages.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "0.35rem",
              padding: "0.4rem 0.5rem 0",
              flexWrap: "wrap",
            }}
          >
            {pendingImages.map((img, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  width: 48,
                  height: 48,
                  borderRadius: 4,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <img
                  src={img}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  onClick={() => removePendingImage(i)}
                  style={{
                    position: "absolute",
                    top: 1,
                    right: 1,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.7)",
                    color: "var(--accent)",
                    border: "none",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          style={{ display: "none" }}
        />

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
          {/* Backend toggle button */}
          {activeAgent && (
            <button
              onClick={() => setShowSwitcher(!showSwitcher)}
              style={{
                background: showSwitcher ? "var(--surface-hover)" : "transparent",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "0.15rem 0.4rem",
                fontSize: "0.75rem",
                color: "var(--text-dim)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                flexShrink: 0,
                transition: "all 0.1s",
              }}
            >
              <span style={{ fontSize: "0.75rem" }}>{BACKEND_ICONS[activeAgent.backend] || "◆"}</span>
              {shortModel(activeAgent.model)}
              <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>▼</span>
            </button>
          )}

          {/* Image attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!claudeConnected || !activeAgent}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.15rem 0.35rem",
              fontSize: "0.75rem",
              color: "var(--text-dim)",
              cursor: claudeConnected && activeAgent ? "pointer" : "default",
              fontFamily: "inherit",
              flexShrink: 0,
              opacity: claudeConnected && activeAgent ? 1 : 0.4,
              transition: "all 0.1s",
            }}
            title="Attach image"
          >
            +
          </button>

          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              onInputChange(e.target.value);
              // Auto-resize
              const ta = e.target;
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder={
              !claudeConnected
                ? "No agents connected..."
                : !activeAgent
                  ? "Create an agent first..."
                  : `Message ${activeAgent.name}...`
            }
            disabled={!claudeConnected || !activeAgent}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: "0.75rem",
              fontFamily: "inherit",
              maxHeight: 180,
              overflow: "auto",
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={(!inputValue.trim() && pendingImages.length === 0) || streaming || !claudeConnected || !activeAgent}
            style={{
              background:
                (inputValue.trim() || pendingImages.length > 0) && claudeConnected && activeAgent
                  ? "var(--accent)"
                  : "var(--border)",
              color:
                (inputValue.trim() || pendingImages.length > 0) && claudeConnected && activeAgent
                  ? "var(--bg)"
                  : "var(--text-muted)",
              border: "none",
              borderRadius: 3,
              width: 22,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor:
                (inputValue.trim() || pendingImages.length > 0) && !streaming && claudeConnected && activeAgent
                  ? "pointer"
                  : "default",
              fontSize: "0.75rem",
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
});

// ─── Backend Switcher (Emdash-style popover) ────────────────────────

function BackendSwitcher({
  backends,
  currentBackend,
  currentModel,
  onSelect,
  onClose,
}: {
  backends: BackendDef[];
  currentBackend: string;
  currentModel: string;
  onSelect: (backend: string, model: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 0.25rem)",
        left: "0.5rem",
        width: 280,
        background: "var(--surface)",
        border: "1px solid var(--border-light)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        zIndex: 100,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "0.5rem 0.6rem",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "var(--text-dim)",
        }}
      >
        Switch engine
      </div>

      {/* Backend list */}
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {backends.map((backend) => (
          <div key={backend.id}>
            {/* Backend header */}
            <div
              style={{
                padding: "0.4rem 0.6rem 0.2rem",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <span style={{ fontSize: "0.75rem" }}>{BACKEND_ICONS[backend.id] || "◆"}</span>
              {backend.label}
            </div>

            {/* Model options */}
            {backend.models.map((model) => {
              const isActive = backend.id === currentBackend && model.id === currentModel;
              return (
                <button
                  key={model.id}
                  onClick={() => onSelect(backend.id, model.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.4rem 0.6rem 0.4rem 1.4rem",
                    background: isActive ? "color-mix(in srgb, var(--text) 5%, transparent)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.75rem",
                    color: isActive ? "var(--text)" : "var(--text-dim)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "color-mix(in srgb, var(--text) 3%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{model.label}</span>
                  {isActive && (
                    <span style={{ color: "var(--green)", fontSize: "0.75rem" }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────

function EmptyState({
  agent,
  onSend,
}: {
  agent: AgentInfo;
  onSend: (text: string) => void;
}) {
  return (
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
      <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", textAlign: "center" }}>
        {agent.name}
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.4rem" }}>
          {BACKEND_ICONS[agent.backend]} {agent.backend}
        </span>
      </div>
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        {agent.role === "general" &&
          "Click anything in the panels, or ask about your projects, calendar, metrics, or team."}
        {agent.role === "research" &&
          "Ask me to dig into a topic, compare options, or analyze data."}
        {agent.role === "writer" &&
          "I can draft emails, memos, announcements, or any document."}
        {agent.role === "ops" &&
          "I can help plan, schedule, track, and organize operations."}
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
        {getStarters(agent.role).map((q) => (
          <button
            key={q}
            onClick={() => onSend(q)}
            style={{
              background: "var(--surface-hover)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "0.25rem 0.5rem",
              fontSize: "0.75rem",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Starters ───────────────────────────────────────────────────────

function getStarters(role: string): string[] {
  switch (role) {
    case "research":
      return ["Compare our competitors", "Research market sizing for...", "What are the trends in..."];
    case "writer":
      return ["Draft an update email to investors", "Write a team announcement about...", "Help me write a cold outreach email"];
    case "ops":
      return ["Plan next week's priorities", "Create a checklist for...", "What's blocking progress on..."];
    default:
      return ["Prep me for today's meetings", "Status across all projects?", "What should I focus on today?", "Compare our competitors"];
  }
}
