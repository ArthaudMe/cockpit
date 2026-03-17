"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type SkillInfo = {
  id: string;
  name: string;
  slash: string;
  icon: string;
  description: string;
  category: string;
  enabled: boolean;
};

type AgentInfo = {
  id: string;
  name: string;
  role: string;
  backend: string;
  model: string;
  busy: boolean;
};

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
};

type BackendDef = {
  id: string;
  label: string;
  models: { id: string; label: string }[];
  defaultModel: string;
};

type Profile = {
  name: string;
  role: string;
  company: string;
};

const BACKEND_ICONS: Record<string, string> = {
  claude: "◇",
  codex: "◆",
  ollama: "○",
};

const ROLE_LABELS: Record<string, string> = {
  general: "General",
  research: "Research",
  writer: "Writer",
  ops: "Ops",
};

type DatasourceInfo = {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  needsOAuth: boolean;
};

export function SettingsView({ onBack }: { onBack: () => void }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [backends, setBackends] = useState<BackendStatus[]>([]);
  const [backendDefs, setBackendDefs] = useState<BackendDef[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: "", role: "", company: "" });
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [datasources, setDatasources] = useState<DatasourceInfo[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  const fetchDatasources = useCallback(() => {
    fetch("/api/datasources")
      .then((r) => r.json())
      .then((data: { datasources: DatasourceInfo[] }) => setDatasources(data.datasources))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: AgentInfo[]) => setAgents(data))
      .catch(() => {});

    fetch("/api/detect-backends")
      .then((r) => r.json())
      .then((data: { backends: BackendStatus[] }) => setBackends(data.backends))
      .catch(() => {});

    fetch("/api/backends")
      .then((r) => r.json())
      .then((data: BackendDef[]) => setBackendDefs(data))
      .catch(() => {});

    fetch("/api/profile")
      .then((r) => r.json())
      .then((data: Profile) => setProfile(data))
      .catch(() => {});

    fetch("/api/skills")
      .then((r) => r.json())
      .then((data: SkillInfo[]) => setSkills(data))
      .catch(() => {});

    fetchDatasources();
  }, [fetchDatasources]);

  // Poll for datasource status while connecting, with 2-minute timeout
  useEffect(() => {
    if (!connecting) return;
    const interval = setInterval(fetchDatasources, 2000);
    const timeout = setTimeout(() => setConnecting(null), 120_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [connecting, fetchDatasources]);

  // Clear connecting state when the service becomes connected
  useEffect(() => {
    if (connecting && datasources.find((d) => d.id === connecting)?.connected) {
      setConnecting(null);
    }
  }, [connecting, datasources]);

  const saveProfile = useCallback(async (updates: Partial<Profile>) => {
    const updated = { ...profile, ...updates };
    setProfile(updated);
    setEditingField(null);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch {}
  }, [profile]);

  const handleConnect = useCallback(async (serviceId: string) => {
    try {
      setConnecting(serviceId);
      const res = await fetch(`/api/datasources/connect?service=${serviceId}`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank", "width=600,height=700");
      }
    } catch {
      setConnecting(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (serviceId: string) => {
    try {
      await fetch("/api/datasources/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceId }),
      });
      fetchDatasources();
    } catch {}
  }, [fetchDatasources]);

  const handleRenameAgent = useCallback(
    async (id: string) => {
      if (!editName.trim()) {
        setEditingAgent(null);
        return;
      }
      try {
        const res = await fetch(`/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editName.trim() }),
        });
        const updated: AgentInfo = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } catch {}
      setEditingAgent(null);
    },
    [editName]
  );

  const handleDeleteAgent = useCallback(async (id: string) => {
    await fetch(`/api/agents/${id}`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const toggleSkill = useCallback(async (id: string, enabled: boolean) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    try {
      await fetch("/api/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
    } catch {}
  }, []);

  const handleSwitchBackend = useCallback(
    async (agentId: string, backend: string, model: string) => {
      try {
        const res = await fetch(`/api/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backend, model }),
        });
        const updated: AgentInfo = await res.json();
        setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } catch {}
    },
    []
  );

  const sectionTitle: React.CSSProperties = {
    fontSize: "0.55rem",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: "0.6rem",
  };

  const card: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "0.6rem 0.75rem",
    marginBottom: "0.4rem",
  };

  return (
    <div
      className="panel"
      style={{ height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          minHeight: "2rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "0.7rem",
            padding: "0 0.2rem",
          }}
        >
          ←
        </button>
        <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)" }}>Settings</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}>
        {/* ── Profile ── */}
        <div style={sectionTitle}>Profile</div>
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: profile.name ? "var(--accent)" : "var(--border)",
                color: "var(--bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {profile.name ? profile.name.charAt(0).toUpperCase() : "?"}
            </div>
            <div style={{ flex: 1 }}>
              <EditableField
                value={profile.name}
                placeholder="Your name"
                isEditing={editingField === "name"}
                onStartEdit={() => setEditingField("name")}
                onSave={(v) => saveProfile({ name: v })}
                onCancel={() => setEditingField(null)}
                style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}
              />
              <EditableField
                value={profile.role}
                placeholder="Your role"
                isEditing={editingField === "role"}
                onStartEdit={() => setEditingField("role")}
                onSave={(v) => saveProfile({ role: v })}
                onCancel={() => setEditingField(null)}
                style={{ fontSize: "0.5rem", color: "var(--text-muted)", marginTop: "0.1rem" }}
              />
            </div>
          </div>
          <div
            style={{
              marginTop: "0.6rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.5rem" }}>
              <span style={{ color: "var(--text-muted)" }}>Company:</span>
              <EditableField
                value={profile.company}
                placeholder="Your company"
                isEditing={editingField === "company"}
                onStartEdit={() => setEditingField("company")}
                onSave={(v) => saveProfile({ company: v })}
                onCancel={() => setEditingField(null)}
                style={{ fontSize: "0.5rem", color: "var(--text-dim)" }}
                inline
              />
            </div>
          </div>
        </div>

        {/* ── Connected Tools ── */}
        <div style={{ ...sectionTitle, marginTop: "1.25rem" }}>Connected Tools</div>
        <div
          style={{
            fontSize: "0.45rem",
            color: "var(--text-muted)",
            marginBottom: "0.5rem",
            lineHeight: 1.5,
          }}
        >
          All data stays on your machine. Tokens are stored locally and no one else, including us, can access your accounts.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          {datasources.map((ds) => {
            const isConnecting = connecting === ds.id;
            const actionBtn: React.CSSProperties = {
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "0.45rem",
              padding: "0.2rem 0.5rem",
              transition: "all 0.15s",
              marginTop: "0.35rem",
            };
            return (
              <div key={ds.id} style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>{ds.icon}</span>
                    <div>
                      <div style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)" }}>
                        {ds.name}
                      </div>
                      <div style={{ fontSize: "0.45rem", color: "var(--text-muted)" }}>
                        {ds.description}
                      </div>
                    </div>
                  </div>
                  <span
                    className="dot"
                    style={{
                      background: ds.connected
                        ? "var(--green)"
                        : isConnecting
                          ? "var(--yellow)"
                          : "var(--border)",
                      width: 6,
                      height: 6,
                      flexShrink: 0,
                      animation: isConnecting ? "pulse 1.5s ease-in-out infinite" : "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  {ds.connected ? (
                    <button
                      onClick={() => handleDisconnect(ds.id)}
                      style={actionBtn}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--red)";
                        e.currentTarget.style.color = "var(--red)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--text)";
                      }}
                    >
                      Disconnect
                    </button>
                  ) : ds.needsOAuth ? (
                    <button
                      onClick={() => !isConnecting && handleConnect(ds.id)}
                      disabled={isConnecting}
                      style={{
                        ...actionBtn,
                        borderColor: isConnecting ? "var(--yellow)" : "var(--accent)",
                        color: isConnecting ? "var(--yellow)" : "var(--accent)",
                        cursor: isConnecting ? "wait" : "pointer",
                      }}
                    >
                      {isConnecting ? "Waiting..." : "Connect"}
                    </button>
                  ) : (
                    <span style={{ fontSize: "0.4rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                      Auto-detected
                    </span>
                  )}
                  {ds.connected && (
                    <span style={{ fontSize: "0.4rem", color: "var(--green)", marginTop: "0.35rem" }}>
                      Connected
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Skills ── */}
        <div style={{ ...sectionTitle, marginTop: "1.25rem" }}>
          Skills
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: "0.4rem", fontSize: "0.45rem" }}>
            {skills.filter((s) => s.enabled).length}/{skills.length} active
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" }}>
          {skills.map((skill) => (
            <div key={skill.id} style={{ ...card, opacity: skill.enabled ? 1 : 0.5, transition: "opacity 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.75rem", flexShrink: 0 }}>{skill.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.55rem", fontWeight: 600, color: "var(--text)" }}>{skill.name}</div>
                    <div style={{ fontSize: "0.4rem", color: "var(--text-muted)", marginTop: "0.05rem" }}>{skill.slash} — {skill.description}</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleSkill(skill.id, !skill.enabled)}
                  style={{
                    background: skill.enabled ? "var(--accent)" : "var(--border)",
                    border: "none",
                    borderRadius: 8,
                    width: 28,
                    height: 16,
                    position: "relative",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ position: "absolute", top: 2, left: skill.enabled ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "var(--bg)", transition: "left 0.15s" }} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── AI Engines ── */}
        <div style={{ ...sectionTitle, marginTop: "1.25rem" }}>AI Engines</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem" }}>
          {backends.map((b) => (
            <div
              key={b.id}
              style={{
                ...card,
                flex: 1,
                marginBottom: 0,
                opacity: b.installed ? 1 : 0.5,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.25rem" }}>
                <span style={{ fontSize: "0.7rem" }}>{BACKEND_ICONS[b.id] || "?"}</span>
                <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)" }}>
                  {b.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <span
                  className="dot"
                  style={{
                    background: b.installed ? "var(--green)" : "var(--red)",
                    width: 5,
                    height: 5,
                  }}
                />
                <span style={{ fontSize: "0.45rem", color: "var(--text-muted)" }}>
                  {b.installed ? b.version || "Ready" : "Not installed"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Agents ── */}
        <div style={{ ...sectionTitle, marginTop: "1.25rem" }}>Agents</div>
        {agents.map((agent) => {
          const isEditing = editingAgent === agent.id;

          return (
            <div key={agent.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1 }}>
                  <span
                    className="dot"
                    style={{
                      background: agent.busy ? "var(--yellow)" : "var(--green)",
                      width: 6,
                      height: 6,
                      flexShrink: 0,
                    }}
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => handleRenameAgent(agent.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameAgent(agent.id);
                        if (e.key === "Escape") setEditingAgent(null);
                      }}
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border-light)",
                        borderRadius: 3,
                        padding: "0.15rem 0.3rem",
                        fontSize: "0.6rem",
                        color: "var(--text)",
                        fontFamily: "inherit",
                        outline: "none",
                        width: 120,
                      }}
                    />
                  ) : (
                    <span
                      style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}
                      onClick={() => {
                        setEditingAgent(agent.id);
                        setEditName(agent.name);
                      }}
                      title="Click to rename"
                    >
                      {agent.name}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: "0.45rem",
                      background: "rgba(255,255,255,0.06)",
                      padding: "0.1rem 0.3rem",
                      borderRadius: 3,
                      color: "var(--text-muted)",
                    }}
                  >
                    {ROLE_LABELS[agent.role] || agent.role}
                  </span>
                </div>

                {agents.length > 1 && (
                  <button
                    onClick={() => handleDeleteAgent(agent.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "0.5rem",
                      padding: "0.1rem 0.3rem",
                      opacity: 0.5,
                      transition: "opacity 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "1";
                      e.currentTarget.style.color = "var(--red)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "0.5";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    title="Delete agent"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Engine & model row */}
              <div
                style={{
                  marginTop: "0.4rem",
                  paddingTop: "0.35rem",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span style={{ fontSize: "0.5rem", color: "var(--text-muted)", flexShrink: 0 }}>
                  Engine:
                </span>
                <select
                  value={`${agent.backend}:${agent.model}`}
                  onChange={(e) => {
                    const [b, m] = e.target.value.split(":");
                    handleSwitchBackend(agent.id, b, m);
                  }}
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "0.15rem 0.3rem",
                    fontSize: "0.5rem",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    outline: "none",
                    flex: 1,
                    maxWidth: 220,
                  }}
                >
                  {backendDefs.map((b) =>
                    b.models.map((m) => (
                      <option key={`${b.id}:${m.id}`} value={`${b.id}:${m.id}`}>
                        {BACKEND_ICONS[b.id]} {b.label} — {m.label}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          );
        })}

        {/* Bottom spacer */}
        <div style={{ height: "2rem" }} />
      </div>
    </div>
  );
}

// ─── Editable Field ──────────────────────────────────────────────────

function EditableField({
  value,
  placeholder,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  style,
  inline,
}: {
  value: string;
  placeholder: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: string) => void;
  onCancel: () => void;
  style?: React.CSSProperties;
  inline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(value);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(draft);
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        style={{
          ...style,
          background: "var(--bg)",
          border: "1px solid var(--border-light)",
          borderRadius: 3,
          padding: "0.1rem 0.25rem",
          fontFamily: "inherit",
          outline: "none",
          width: inline ? 140 : "100%",
          display: inline ? "inline-block" : "block",
        }}
      />
    );
  }

  return (
    <div
      onClick={onStartEdit}
      style={{
        ...style,
        cursor: "pointer",
        display: inline ? "inline" : "block",
      }}
      title="Click to edit"
    >
      {value || (
        <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{placeholder}</span>
      )}
    </div>
  );
}
