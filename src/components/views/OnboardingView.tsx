"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  installHint?: string;
};

type DetectionResult = {
  backends: BackendStatus[];
  anyAvailable: boolean;
};

type BackendModel = {
  id: string;
  label: string;
};

type BackendDef = {
  id: string;
  label: string;
  models: BackendModel[];
  defaultModel: string;
};

type AgentInfo = {
  id: string;
  name: string;
  role: string;
  backend: string;
  model: string;
};

type OnboardingStep = "intro" | "agent" | "datasources";

const CLAUDE_INSTALL_CMD = "curl -fsSL https://claude.ai/install.sh | bash";
const CORE_DATASOURCE_ORDER = [
  "calendar",
  "gmail",
  "slack",
  "linear",
  "github",
  "notion",
  "granola",
  "posthog",
  "attio",
];

interface DatasourceInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  needsOAuth: boolean;
}

type OnboardingDatasource = DatasourceInfo & {
  displayId: string;
  connectId: string;
};

export function OnboardingView({
  onComplete,
}: {
  onComplete: () => void;
  error?: string;
}) {
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [backendDefs, setBackendDefs] = useState<BackendDef[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedBackend, setSelectedBackend] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      const [detectRes, backendsRes, agentsRes] = await Promise.all([
        fetch("/api/detect-backends"),
        fetch("/api/backends"),
        fetch("/api/agents"),
      ]);
      const data: DetectionResult = await detectRes.json();
      const defs: BackendDef[] = await backendsRes.json();
      const agentList: AgentInfo[] = await agentsRes.json();
      setDetection(data);
      setBackendDefs(defs);
      setAgents(agentList);

      const installed = data.backends.filter((backend) => backend.installed);
      const current = agentList[0];
      const recommended =
        installed.find((backend) => backend.id === current?.backend) ||
        installed[0] ||
        data.backends[0];
      if (recommended) {
        const def = defs.find((backend) => backend.id === recommended.id);
        const currentModelMatchesRecommended = current?.backend === recommended.id;
        setSelectedBackend((prev) => prev || recommended.id);
        setSelectedModel((prev) =>
          prev || (currentModelMatchesRecommended ? current?.model : null) || def?.defaultModel || def?.models[0]?.id || null
        );
      }
    } catch {
      // Keep the install guidance visible if detection fails.
    } finally {
      setDetecting(false);
    }
  }, []);

  useEffect(() => {
    if (step !== "agent") return;
    detect();
    if (detection?.anyAvailable) return;
    const interval = setInterval(detect, 5000);
    return () => clearInterval(interval);
  }, [step, detect, detection?.anyAvailable]);

  const handleConfirmAgent = useCallback(async () => {
    setAgentError(null);
    if (!selectedBackend) {
      setStep("datasources");
      return;
    }

    const def = backendDefs.find((backend) => backend.id === selectedBackend);
    const model = selectedModel || def?.defaultModel || def?.models[0]?.id;
    if (!model) {
      setAgentError("Choose a model before continuing.");
      return;
    }

    setSavingAgent(true);
    try {
      const agent = agents[0];
      const res = agent
        ? await fetch(`/api/agents/${agent.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ backend: selectedBackend, model }),
          })
        : await fetch("/api/agents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Pilot", role: "general", backend: selectedBackend, model }),
          });

      const updated = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(updated.error || "Couldn't save the default agent.");
      }
      if (updated.id) {
        localStorage.setItem("cockpit-active-agent", JSON.stringify(updated.id));
      }
      setAgents((prev) => (prev.length > 0 ? prev.map((agent, i) => (i === 0 ? updated : agent)) : [updated]));
      setStep("datasources");
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Couldn't save the default agent.");
    } finally {
      setSavingAgent(false);
    }
  }, [agents, backendDefs, selectedBackend, selectedModel]);

  if (step === "intro") {
    return <IntroScreen onContinue={() => setStep("agent")} />;
  }

  if (step === "agent") {
    return (
      <AgentSetupScreen
        detection={detection}
        backendDefs={backendDefs}
        selectedBackend={selectedBackend}
        selectedModel={selectedModel}
        detecting={detecting}
        saving={savingAgent}
        error={agentError}
        onSelectBackend={(backendId) => {
          const def = backendDefs.find((backend) => backend.id === backendId);
          setSelectedBackend(backendId);
          setSelectedModel(def?.defaultModel || def?.models[0]?.id || null);
        }}
        onSelectModel={setSelectedModel}
        onDetect={detect}
        onBack={() => setStep("intro")}
        onContinue={handleConfirmAgent}
      />
    );
  }

  if (step === "datasources") {
    return <DatasourcesScreen onBack={() => setStep("agent")} onContinue={onComplete} />;
  }

  return null;
}

function StepShell({
  children,
  maxWidth = 640,
}: {
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <div style={fullscreen}>
      <div style={{ maxWidth, width: "100%" }}>{children}</div>
    </div>
  );
}

function StepIndicator({ active }: { active: OnboardingStep }) {
  const steps: { id: OnboardingStep; label: string }[] = [
    { id: "intro", label: "Intro" },
    { id: "agent", label: "Agent" },
    { id: "datasources", label: "Tools" },
  ];

  return (
    <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1.25rem" }}>
      {steps.map((step) => (
        <div
          key={step.id}
          style={{
            flex: 1,
            borderTop: `2px solid ${step.id === active ? "var(--text)" : "var(--border)"}`,
            paddingTop: "0.35rem",
            fontSize: "0.68rem",
            color: step.id === active ? "var(--text)" : "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: 0,
            fontWeight: 700,
          }}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}

function IntroScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <StepShell maxWidth={680}>
      <StepIndicator active="intro" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: "1.25rem", alignItems: "center" }}>
        <div>
          <div style={labelStyle}>Cockpit setup</div>
          <h1 style={headlineStyle}>Built for founders operating from live company context.</h1>
          <p style={copyStyle}>
            Cockpit turns your calendar, inbox, team messages, issues, docs, and meeting notes into a local operating
            workspace. It is for founders who need to inspect the business, ask a local agent for help, and take action
            without stitching tools together by hand.
          </p>
          <div style={{ display: "grid", gap: "0.45rem", marginTop: "1rem" }}>
            {[
              "Local-first by default: company context and tokens stay on this machine.",
              "Opinionated setup: connect the tools most founders already run on.",
              "Bring your own agent: Claude, Codex, or Ollama can power the chat layer.",
            ].map((item) => (
              <div key={item} style={checkRowStyle}>
                <span style={checkIconStyle}>✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <button onClick={onContinue} style={{ ...primaryBtn, marginTop: "1.35rem", padding: "0.5rem 1.35rem" }}>
            Choose default agent
          </button>
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "var(--surface)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.32)",
          }}
        >
          <img src="/cockpit-screenshot.png" alt="Cockpit dashboard" style={{ width: "100%", display: "block" }} />
        </div>
      </div>
    </StepShell>
  );
}

function DatasourcesScreen({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const [datasources, setDatasources] = useState<DatasourceInfo[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPostHogForm, setShowPostHogForm] = useState(false);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/datasources");
      const data = await res.json();
      setDatasources(data.datasources || []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    if (connecting && datasources.find((d) => d.id === connecting)?.connected) {
      setConnectError(null);
      setConnecting(null);
    }
  }, [connecting, datasources]);

  const handleConnect = useCallback(async (serviceId: string) => {
    if (serviceId === "posthog") {
      setShowPostHogForm(true);
      setConnectError(null);
      return;
    }

    setConnecting(serviceId);
    setConnectError(null);
    try {
      const res = await fetch(`/api/datasources/connect?service=${serviceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Couldn't start the connection.");
      }
      if (data.reconnected) {
        await fetchStatus();
        setConnecting(null);
      } else if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setConnecting(null);
      setConnectError(err instanceof Error ? err.message : "Couldn't start the connection.");
    }
    connectTimeoutRef.current = setTimeout(() => setConnecting(null), 5000);
  }, [fetchStatus]);

  const coreDatasources = buildCoreDatasources(datasources);
  const connectedCount = coreDatasources.filter((d) => d.connected).length;

  return (
    <StepShell maxWidth={620}>
      <StepIndicator active="datasources" />
      <div style={{ marginBottom: "1.2rem" }}>
        <div style={labelStyle}>Core tools</div>
        <h1 style={headlineStyle}>Pilot your company from one screen.</h1>
        <p style={copyStyle}>
          Cockpit is the harness for founders to stay ontop of their work and the work being done in the company.
          Cockpit turns your calendar, inbox, team messages, issues, docs, and meeting notes into a local operating
          workspace.
        </p>
        <div style={{ display: "grid", gap: "0.45rem", marginTop: "0.8rem" }}>
          {[
            "Local-first by default: company context and tokens stay on this machine.",
            "Opinionated setup: connect the tools most founders already run on.",
            "Bring your own agent subscription: Claude, Codex, or Ollama can power the chat layer.",
          ].map((item) => (
            <div key={item} style={checkRowStyle}>
              <span style={checkIconStyle}>✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        {connectError && (
          <div
            style={{
              marginTop: "0.7rem",
              border: "1px solid color-mix(in srgb, var(--red) 22%, transparent)",
              borderRadius: 6,
              padding: "0.55rem 0.65rem",
              color: "var(--red)",
              background: "color-mix(in srgb, var(--red) 8%, transparent)",
              fontSize: "0.72rem",
              lineHeight: 1.45,
            }}
          >
            {connectError}
          </div>
        )}
      </div>

      {showPostHogForm && (
        <PostHogSetupCard
          onSaved={async () => {
            setShowPostHogForm(false);
            await fetchStatus();
          }}
          onCancel={() => setShowPostHogForm(false)}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.45rem" }}>
        {loaded
          ? coreDatasources.map((ds) => (
              <DatasourceCard
                key={ds.displayId}
                datasource={ds}
                connecting={connecting === ds.connectId}
                onConnect={() => handleConnect(ds.connectId)}
              />
            ))
          : CORE_DATASOURCE_ORDER.map((id) => (
              <div key={id} style={{ ...skeletonCardStyle, minHeight: 64 }} />
            ))}
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <button onClick={() => setShowAdvanced((v) => !v)} style={advancedBtn}>
          <span style={{ transform: showAdvanced ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>›</span>
          Advanced
        </button>
        {showAdvanced && (
          <div style={advancedPanelStyle}>
            MCP servers, custom skills, and bring-your-own data tools are available from Settings after setup. They are
            intentionally out of the first-run path so the core operating view is useful before you customize it.
          </div>
        )}
      </div>

      <div style={footerStyle}>
        <button onClick={onBack} style={secondaryBtn}>Back</button>
        <button onClick={onContinue} style={{ ...primaryBtn, padding: "0.5rem 1.35rem" }}>
          Continue
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {connectedCount > 0 ? `${connectedCount} connected` : "No tools connected yet"}
        </span>
      </div>
    </StepShell>
  );
}

function buildCoreDatasources(datasources: DatasourceInfo[]): OnboardingDatasource[] {
  const byId = new Map(datasources.map((d) => [d.id, d]));
  const google = byId.get("google");

  const virtual: OnboardingDatasource[] = [
    {
      ...(google || {
        id: "google",
        name: "Calendar",
        icon: "CAL",
        description: "Upcoming meetings and schedule context",
        connected: false,
        needsOAuth: true,
      }),
      displayId: "calendar",
      connectId: "google",
      name: "Calendar",
      icon: "CAL",
      description: "Meetings, attendees, and timing",
    },
    {
      ...(google || {
        id: "google",
        name: "Gmail",
        icon: "GM",
        description: "Recent email and follow-ups",
        connected: false,
        needsOAuth: true,
      }),
      displayId: "gmail",
      connectId: "google",
      name: "Gmail",
      icon: "GM",
      description: "Email threads and follow-ups",
    },
  ];

  for (const id of ["slack", "linear", "github", "notion", "granola", "posthog", "attio"]) {
    const ds = byId.get(id);
    if (!ds) continue;
    virtual.push({ ...ds, displayId: id, connectId: id });
  }

  return virtual.sort((a, b) => CORE_DATASOURCE_ORDER.indexOf(a.displayId) - CORE_DATASOURCE_ORDER.indexOf(b.displayId));
}

function PostHogSetupCard({
  onSaved,
  onCancel,
}: {
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [apiHost, setApiHost] = useState("https://us.posthog.com");
  const [projectId, setProjectId] = useState("");
  const [personalApiKey, setPersonalApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    color: "var(--text)",
    fontFamily: "inherit",
    fontSize: "0.7rem",
    padding: "0.35rem 0.45rem",
    width: "100%",
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/datasources/posthog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiHost, projectId, personalApiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "PostHog connection failed");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PostHog connection failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: "var(--surface)",
        padding: "0.7rem",
        margin: "0.75rem 0",
      }}
    >
      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.45rem" }}>
        Configure PostHog
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
        <input value={apiHost} onChange={(e) => setApiHost(e.target.value)} placeholder="API host" style={inputStyle} />
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project ID" style={inputStyle} />
      </div>
      <input
        value={personalApiKey}
        onChange={(e) => setPersonalApiKey(e.target.value)}
        placeholder="Personal API key"
        type="password"
        style={{ ...inputStyle, marginTop: "0.45rem" }}
      />
      {error && <div style={{ color: "var(--red)", fontSize: "0.68rem", marginTop: "0.4rem" }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.6rem" }}>
        <button onClick={save} disabled={saving || !projectId.trim() || !personalApiKey.trim()} style={connectBtnStyle(saving)}>
          {saving ? "Validating..." : "Save PostHog"}
        </button>
        <button onClick={onCancel} style={secondaryBtn}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DatasourceCard({
  datasource,
  connecting,
  onConnect,
}: {
  datasource: OnboardingDatasource;
  connecting: boolean;
  onConnect: () => void;
}) {
  return (
    <div style={cardStyle(datasource.connected)}>
      <div style={miniIconStyle(datasource.connected)}>{datasource.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text)" }}>{datasource.name}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem", lineHeight: 1.35 }}>
          {datasource.description}
        </div>
      </div>
      {datasource.connected ? (
        <span style={connectedTextStyle}>Connected</span>
      ) : datasource.needsOAuth || datasource.connectId === "granola" || datasource.connectId === "posthog" || datasource.connectId === "attio" ? (
        <button onClick={onConnect} disabled={connecting} style={connectBtnStyle(connecting)}>
          {connecting
            ? "Connecting..."
            : datasource.connectId === "granola" || datasource.connectId === "attio"
              ? "Connect MCP"
              : datasource.connectId === "posthog"
                ? "Configure"
                : "Connect"}
        </button>
      ) : (
        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>
          Detects locally
        </span>
      )}
    </div>
  );
}

function AgentSetupScreen({
  detection,
  backendDefs,
  selectedBackend,
  selectedModel,
  detecting,
  saving,
  error,
  onSelectBackend,
  onSelectModel,
  onDetect,
  onBack,
  onContinue,
}: {
  detection: DetectionResult | null;
  backendDefs: BackendDef[];
  selectedBackend: string | null;
  selectedModel: string | null;
  detecting: boolean;
  saving: boolean;
  error: string | null;
  onSelectBackend: (backendId: string) => void;
  onSelectModel: (modelId: string) => void;
  onDetect: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [installingClaude, setInstallingClaude] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const backends = detection?.backends || fallbackBackends;
  const ready = backends.some((backend) => backend.installed);
  const selectedDef = backendDefs.find((backend) => backend.id === selectedBackend);
  const selectedInstalled = backends.some((backend) => backend.id === selectedBackend && backend.installed);

  const handleInstallClaude = useCallback(async () => {
    setInstallingClaude(true);
    try {
      const res = await fetch("/api/install-claude", { method: "POST" });
      const data = await res.json();
      if (data.success) onDetect();
    } catch {
      // Manual instructions remain available.
    } finally {
      setInstallingClaude(false);
    }
  }, [onDetect]);

  const handleSignInClaude = useCallback(async () => {
    try {
      await fetch("/api/authenticate-claude", { method: "POST" });
    } catch {
      // Browser login may still have been opened by the route.
    }
  }, []);

  const copyCmd = () => {
    navigator.clipboard.writeText(CLAUDE_INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <StepShell maxWidth={660}>
      <StepIndicator active="agent" />
      <div style={{ marginBottom: "1.2rem" }}>
        <div style={labelStyle}>Local agent</div>
        <h1 style={headlineStyle}>Confirm the agent Cockpit should use.</h1>
        <p style={copyStyle}>
          Cockpit detected the CLI agents on this machine. Pick the default now; you can change backend and model later
          in Settings.
        </p>
      </div>

      <div style={{ display: "grid", gap: "0.45rem" }}>
        {backends.map((backend) => (
          <BackendCard
            key={backend.id}
            backend={backend}
            selected={selectedBackend === backend.id}
            detecting={detecting && !detection}
            installingClaude={installingClaude}
            onSelect={() => backend.installed && onSelectBackend(backend.id)}
            onInstallClaude={handleInstallClaude}
            onSignInClaude={handleSignInClaude}
          />
        ))}
      </div>

      {selectedDef && selectedDef.models.length > 0 && (
        <label style={selectLabelStyle}>
          <span>Model</span>
          <select
            value={selectedModel || selectedDef.defaultModel}
            onChange={(event) => onSelectModel(event.target.value)}
            style={selectStyle}
          >
            {selectedDef.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div
          style={{
            marginTop: "0.7rem",
            border: "1px solid color-mix(in srgb, var(--red) 22%, transparent)",
            borderRadius: 6,
            padding: "0.55rem 0.65rem",
            color: "var(--red)",
            background: "color-mix(in srgb, var(--red) 8%, transparent)",
            fontSize: "0.72rem",
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: "0.7rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <button onClick={onDetect} disabled={detecting} style={secondaryBtn}>
          {detecting ? "Checking..." : "Check again"}
        </button>
        <button onClick={() => setShowManual((v) => !v)} style={secondaryBtn}>
          {showManual ? "Hide install command" : "Manual Claude install"}
        </button>
      </div>

      {showManual && (
        <div style={commandRowStyle}>
          <code style={commandStyle}>$ {CLAUDE_INSTALL_CMD}</code>
          <button onClick={copyCmd} style={{ ...secondaryBtn, flexShrink: 0 }}>{copied ? "Copied" : "Copy"}</button>
        </div>
      )}

      <div style={footerStyle}>
        <button onClick={onBack} style={secondaryBtn}>Back</button>
        <button
          onClick={onContinue}
          disabled={saving}
          style={{ ...primaryBtn, padding: "0.5rem 1.35rem", cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "Saving..." : selectedInstalled ? "Confirm agent" : "Continue without agent"}
        </button>
        <span style={{ fontSize: "0.75rem", color: ready ? "var(--green)" : "var(--text-muted)" }}>
          {selectedInstalled ? "Agent ready" : ready ? "Choose one detected agent" : "No agent detected yet"}
        </span>
      </div>
    </StepShell>
  );
}

function BackendCard({
  backend,
  selected,
  detecting,
  installingClaude,
  onSelect,
  onInstallClaude,
  onSignInClaude,
}: {
  backend: BackendStatus;
  selected: boolean;
  detecting: boolean;
  installingClaude: boolean;
  onSelect: () => void;
  onInstallClaude: () => void;
  onSignInClaude: () => void;
}) {
  const isClaude = backend.id === "claude";
  const installHint = backend.installHint || installHints[backend.id] || "Install the CLI, then check again.";

  return (
    <div
      onClick={onSelect}
      role={backend.installed ? "button" : undefined}
      tabIndex={backend.installed ? 0 : undefined}
      onKeyDown={(event) => {
        if (!backend.installed) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      style={{
        ...cardStyle(selected || backend.installed),
        cursor: backend.installed ? "pointer" : "default",
        outline: selected ? "1px solid var(--green)" : "none",
      }}
    >
      <div style={miniIconStyle(backend.installed)}>{backendIcons[backend.id] || "AI"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text)" }}>{backend.label}</span>
          <span style={statusPillStyle(backend.installed)}>
            {detecting ? "Checking" : selected ? "Selected" : backend.installed ? "Ready" : "Not found"}
          </span>
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.12rem", lineHeight: 1.35 }}>
          {backend.installed
            ? backend.version
              ? `Detected ${backend.version}.`
              : "Detected locally."
            : installHint}
        </div>
      </div>
      {isClaude && (
        <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
          {!backend.installed ? (
            <button onClick={onInstallClaude} disabled={installingClaude} style={connectBtnStyle(installingClaude)}>
              {installingClaude ? "Installing..." : "Install"}
            </button>
          ) : (
            <button onClick={onSignInClaude} style={connectBtnStyle(false)}>Sign in</button>
          )}
        </div>
      )}
    </div>
  );
}

const fallbackBackends: BackendStatus[] = [
  { id: "claude", label: "Claude", installed: false, installHint: "Install Claude Code and sign in with your account." },
  { id: "codex", label: "Codex", installed: false, installHint: "Install Codex CLI and sign in." },
  { id: "ollama", label: "Ollama", installed: false, installHint: "Install Ollama and pull a local model." },
];

const installHints: Record<string, string> = {
  claude: "Install Claude Code and sign in with your Claude account.",
  codex: "Install Codex CLI and sign in before using it in Cockpit.",
  ollama: "Install Ollama, start it locally, and pull a model.",
};

const backendIcons: Record<string, string> = {
  claude: "CL",
  codex: "CX",
  ollama: "OL",
};

const fullscreen: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  background: "var(--bg)",
  padding: "2rem",
};

const headlineStyle: React.CSSProperties = {
  fontSize: "1.28rem",
  fontWeight: 800,
  color: "var(--text)",
  letterSpacing: 0,
  lineHeight: 1.18,
  margin: 0,
};

const copyStyle: React.CSSProperties = {
  fontSize: "0.8rem",
  color: "var(--text-dim)",
  lineHeight: 1.55,
  marginTop: "0.55rem",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--text)",
  color: "var(--bg)",
  border: "none",
  borderRadius: 6,
  padding: "0.35rem 0.9rem",
  fontSize: "0.78rem",
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: 0,
  transition: "opacity 0.15s",
};

const secondaryBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text-muted)",
  fontSize: "0.72rem",
  cursor: "pointer",
  fontFamily: "inherit",
  padding: "0.3rem 0.6rem",
};

const advancedBtn: React.CSSProperties = {
  ...secondaryBtn,
  border: "none",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: 0,
  marginBottom: "0.5rem",
};

const checkRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.45rem",
  fontSize: "0.78rem",
  color: "var(--text-dim)",
  lineHeight: 1.4,
};

const checkIconStyle: React.CSSProperties = {
  color: "var(--green)",
  fontWeight: 800,
  flexShrink: 0,
};

const footerStyle: React.CSSProperties = {
  marginTop: "1.25rem",
  display: "flex",
  alignItems: "center",
  gap: "0.65rem",
};

const skeletonCardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 7,
  background: "color-mix(in srgb, var(--text) 2%, transparent)",
};

const advancedPanelStyle: React.CSSProperties = {
  marginTop: "0.45rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.65rem 0.75rem",
  color: "var(--text-muted)",
  fontSize: "0.74rem",
  lineHeight: 1.45,
};

const commandRowStyle: React.CSSProperties = {
  marginTop: "0.6rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.45rem 0.6rem",
  gap: "0.5rem",
};

const commandStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--green)",
  fontFamily: "inherit",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const selectLabelStyle: React.CSSProperties = {
  marginTop: "0.75rem",
  display: "grid",
  gap: "0.3rem",
  fontSize: "0.72rem",
  color: "var(--text-muted)",
  fontWeight: 700,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: "0.76rem",
  padding: "0.45rem 0.55rem",
};

function cardStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.55rem 0.65rem",
    minHeight: 64,
    border: `1px solid ${active ? "var(--green)" : "var(--border)"}`,
    borderRadius: 7,
    background: active ? "color-mix(in srgb, var(--green) 4%, transparent)" : "var(--surface)",
  };
}

function miniIconStyle(active: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 6,
    border: `1px solid ${active ? "var(--green)" : "var(--border-light)"}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.65rem",
    fontWeight: 800,
    color: active ? "var(--green)" : "var(--text-dim)",
    flexShrink: 0,
  };
}

function connectBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? "var(--border)" : "color-mix(in srgb, var(--text) 8%, transparent)",
    color: disabled ? "var(--text-muted)" : "var(--text)",
    border: "1px solid var(--border-light)",
    borderRadius: 4,
    padding: "0.24rem 0.6rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  };
}

function statusPillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "0.65rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0,
    padding: "0.12rem 0.35rem",
    borderRadius: 4,
    color: active ? "var(--green)" : "var(--text-muted)",
    background: active
      ? "color-mix(in srgb, var(--green) 10%, transparent)"
      : "color-mix(in srgb, var(--text) 4%, transparent)",
  };
}

const connectedTextStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--green)",
  fontWeight: 700,
  flexShrink: 0,
};
