"use client";

import { useState, useEffect } from "react";

type ConnectorStatus = {
  id: string;
  name: string;
  configured: boolean;
};

type ConnectorField = {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  required: boolean;
};

const CONNECTOR_FIELDS: Record<string, ConnectorField[]> = {
  linear: [
    { key: "apiKey", label: "API Key", type: "password", placeholder: "lin_api_...", required: true },
    { key: "teamId", label: "Team ID (optional)", type: "text", placeholder: "team-id", required: false },
  ],
  github: [
    { key: "token", label: "Personal Access Token", type: "password", placeholder: "ghp_...", required: true },
    { key: "org", label: "Organization", type: "text", placeholder: "my-org", required: true },
    { key: "repos", label: "Repos (comma-separated, optional)", type: "text", placeholder: "repo1, repo2", required: false },
  ],
  "google-calendar": [
    { key: "clientId", label: "Client ID", type: "text", placeholder: "xxx.apps.googleusercontent.com", required: true },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "GOCSPX-...", required: true },
    { key: "refreshToken", label: "Refresh Token", type: "password", placeholder: "1//...", required: true },
  ],
  slack: [
    { key: "token", label: "Bot Token", type: "password", placeholder: "xoxb-...", required: true },
  ],
};

const CONNECTOR_ICONS: Record<string, string> = {
  linear: "📋",
  github: "🐙",
  "google-calendar": "📅",
  slack: "💬",
};

export default function SettingsPage() {
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchConnectors = async () => {
    const res = await fetch("/api/connectors");
    const data = await res.json();
    setConnectors(data.connectors || []);
  };

  useEffect(() => {
    fetchConnectors();
  }, []);

  const handleSave = async (connectorId: string) => {
    setSaving(true);
    const fields = CONNECTOR_FIELDS[connectorId] || [];
    const config: Record<string, unknown> = {};

    for (const field of fields) {
      const value = formData[field.key];
      if (field.key === "repos" && value) {
        config[field.key] = value.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (value) {
        config[field.key] = value;
      }
    }

    await fetch("/api/connectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connector: connectorId, config }),
    });

    await fetchConnectors();
    setSaving(false);
    setEditing(null);
    setFormData({});
    setTestResult(null);
  };

  const handleDisconnect = async (connectorId: string) => {
    await fetch("/api/connectors", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connector: connectorId }),
    });
    await fetchConnectors();
  };

  const handleTest = async (connectorId: string) => {
    setTesting(connectorId);
    setTestResult(null);

    // Save first so the connector can read the config
    await handleSave(connectorId);

    const res = await fetch("/api/connectors/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connector: connectorId }),
    });

    const data = await res.json();
    setTestResult(data);
    setTesting(null);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono)" }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 0.75rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <a
            href="/"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 3,
              color: "var(--text-dim)",
              fontSize: "0.55rem",
              padding: "0.15rem 0.4rem",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            ← COCKPIT
          </a>
          <span style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            SETTINGS
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.3rem", letterSpacing: "0.05em" }}>
          DATA CONNECTORS
        </h2>
        <p style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
          Connect your tools to replace static demo data with live information.
          API keys are stored locally in ~/.cockpit/config.json.
        </p>

        {connectors.map((c) => {
          const fields = CONNECTOR_FIELDS[c.id] || [];
          const isEditing = editing === c.id;

          return (
            <div
              key={c.id}
              className="panel"
              style={{ marginBottom: "0.5rem" }}
            >
              <div
                className="panel-header"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (isEditing) {
                    setEditing(null);
                    setFormData({});
                    setTestResult(null);
                  } else {
                    setEditing(c.id);
                    setFormData({});
                    setTestResult(null);
                  }
                }}
              >
                <div className="panel-title-row">
                  <span style={{ fontSize: "0.7rem", marginRight: "0.3rem" }}>
                    {CONNECTOR_ICONS[c.id] || "🔌"}
                  </span>
                  <span className="panel-title">{c.name}</span>
                  <span
                    className={`tag ${c.configured ? "tag-green" : "tag-dim"}`}
                  >
                    {c.configured ? "Connected" : "Not configured"}
                  </span>
                </div>
                <span className={`panel-toggle ${isEditing ? "open" : ""}`}>▶</span>
              </div>

              {isEditing && (
                <div className="panel-content">
                  {fields.map((field) => (
                    <div key={field.key} style={{ marginBottom: "0.5rem" }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.55rem",
                          color: "var(--text-dim)",
                          marginBottom: "0.2rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {field.label}
                        {field.required && (
                          <span style={{ color: "var(--red)" }}> *</span>
                        )}
                      </label>
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={formData[field.key] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 3,
                          color: "var(--text)",
                          fontSize: "0.6rem",
                          fontFamily: "inherit",
                          padding: "0.35rem 0.5rem",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  ))}

                  {testResult && (
                    <div
                      style={{
                        padding: "0.35rem 0.5rem",
                        borderRadius: 3,
                        fontSize: "0.55rem",
                        marginBottom: "0.5rem",
                        background: testResult.ok
                          ? "rgba(68, 255, 136, 0.1)"
                          : "rgba(255, 68, 68, 0.1)",
                        color: testResult.ok ? "var(--green)" : "var(--red)",
                        border: `1px solid ${testResult.ok ? "var(--green)" : "var(--red)"}`,
                      }}
                    >
                      {testResult.ok
                        ? "Connection successful!"
                        : `Error: ${testResult.error}`}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.3rem" }}>
                    <button
                      onClick={() => handleTest(c.id)}
                      disabled={!!testing}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: 3,
                        color: "var(--text-dim)",
                        fontSize: "0.5rem",
                        padding: "0.25rem 0.5rem",
                        cursor: testing ? "wait" : "pointer",
                        fontFamily: "inherit",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {testing === c.id ? "Testing..." : "Test Connection"}
                    </button>
                    <button
                      onClick={() => handleSave(c.id)}
                      disabled={saving}
                      style={{
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 3,
                        color: "var(--bg)",
                        fontSize: "0.5rem",
                        padding: "0.25rem 0.5rem",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        fontWeight: 700,
                      }}
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    {c.configured && (
                      <button
                        onClick={() => handleDisconnect(c.id)}
                        style={{
                          background: "none",
                          border: "1px solid var(--red)",
                          borderRadius: 3,
                          color: "var(--red)",
                          fontSize: "0.5rem",
                          padding: "0.25rem 0.5rem",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Webhook URLs section */}
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.3rem", marginTop: "1.5rem", letterSpacing: "0.05em" }}>
          WEBHOOK ENDPOINTS
        </h2>
        <p style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
          Configure these URLs in your tools to receive real-time alerts.
        </p>

        {["linear", "github", "slack"].map((source) => (
          <div
            key={source}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "0.6rem" }}>{CONNECTOR_ICONS[source]}</span>
            <span style={{ fontSize: "0.55rem", color: "var(--text-dim)", textTransform: "capitalize", width: 60 }}>
              {source}
            </span>
            <code
              style={{
                flex: 1,
                fontSize: "0.5rem",
                color: "var(--text-muted)",
                background: "var(--bg)",
                padding: "0.2rem 0.4rem",
                borderRadius: 3,
              }}
            >
              {typeof window !== "undefined"
                ? `${window.location.origin}/api/webhooks/${source}`
                : `/api/webhooks/${source}`}
            </code>
          </div>
        ))}

        {/* Cron endpoints section */}
        <h2 style={{ fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.3rem", marginTop: "1.5rem", letterSpacing: "0.05em" }}>
          SCHEDULED TASKS
        </h2>
        <p style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
          Trigger these endpoints manually or via external cron to generate briefings.
        </p>

        {[
          { name: "daily-briefing", label: "Daily Briefing", schedule: "8:00 AM weekdays" },
          { name: "meeting-prep", label: "Meeting Prep", schedule: "Every 15min, 8AM-6PM" },
        ].map((task) => (
          <div
            key={task.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.35rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <div style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)" }}>{task.label}</div>
              <div style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>{task.schedule}</div>
            </div>
            <code style={{ fontSize: "0.5rem", color: "var(--text-muted)", background: "var(--bg)", padding: "0.2rem 0.4rem", borderRadius: 3 }}>
              GET /api/cron/{task.name}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
