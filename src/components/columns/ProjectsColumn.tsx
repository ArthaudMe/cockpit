"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type ManualProject = {
  id: string;
  name: string;
  color: string;
};

type InferredProject = {
  name: string;
  category: string;
  status: string;
  tools: string[];
  recent_activity: { date: string; event: string; source: string }[];
};

function Panel({
  title,
  count,
  defaultOpen = true,
  onAdd,
  action,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  onAdd?: () => void;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="panel">
      <div className="panel-header" onClick={() => setOpen(!open)}>
        <div className="panel-title-row">
          <span className="panel-title">{title}</span>
          {count !== undefined && <span className="panel-count">{count}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          {onAdd && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.75rem",
                padding: "0 0.2rem",
                lineHeight: 1,
              }}
              title="Add project"
            >
              +
            </button>
          )}
          <span className={`panel-toggle ${open ? "open" : ""}`}>&#9654;</span>
        </div>
      </div>
      {open && <div className="panel-content">{children}</div>}
    </div>
  );
}

export function ProjectsColumn({
  onPrefill,
  inferredProjects,
  inferLoading,
  onRefresh,
  hasAnyDatasource,
  onSettingsClick,
}: {
  onPrefill: (text: string) => void;
  inferredProjects?: InferredProject[];
  inferLoading?: boolean;
  onRefresh?: () => void;
  hasAnyDatasource?: boolean;
  onSettingsClick?: () => void;
}) {
  const [manualProjects, setManualProjects] = useState<ManualProject[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const createRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ManualProject[]) => setManualProjects(data))
      .catch(() => {});
  }, []);

  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) {
      setShowCreate(false);
      return;
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const project: ManualProject = await res.json();
        setManualProjects((prev) => [...prev, project]);
      }
    } catch {}
    setCreateName("");
    setShowCreate(false);
  }, [createName]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setManualProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => createRef.current?.focus(), 0);
    }
  }, [showCreate]);

  const inferred = inferredProjects || [];
  const totalCount = manualProjects.length + inferred.length;

  const refreshBtn = onRefresh ? (
    <button
      onClick={onRefresh}
      disabled={inferLoading}
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 3,
        color: "var(--text-muted)",
        fontSize: "0.75rem",
        padding: "0.1rem 0.35rem",
        cursor: inferLoading ? "default" : "pointer",
        opacity: inferLoading ? 0.5 : 1,
        fontFamily: "inherit",
      }}
    >
      {inferLoading ? "..." : "Refresh"}
    </button>
  ) : null;

  return (
    <div>
      <Panel
        title="Projects"
        count={totalCount}
        onAdd={manualProjects.length < 5 ? () => setShowCreate(true) : undefined}
        action={refreshBtn}
      >
        {/* Loading state for inference */}
        {inferLoading && inferred.length === 0 && manualProjects.length === 0 && (
          <div style={{ padding: "0.5rem 0", textAlign: "center" }}>
            <span
              className="dot"
              style={{
                background: "var(--accent)",
                animation: "pulse 1.5s ease-in-out infinite",
                display: "inline-block",
                marginRight: "0.3rem",
              }}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Inferring projects...
            </span>
          </div>
        )}

        {/* Empty state */}
        {!inferLoading && totalCount === 0 && !showCreate && (
          <div
            style={{
              padding: "0.75rem 0.25rem",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            {hasAnyDatasource ? (
              <>No projects detected yet.</>
            ) : (
              <>
                No projects yet.
                <br />
                <button
                  onClick={() => setShowCreate(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "0.75rem",
                    padding: 0,
                    textDecoration: "underline",
                    textUnderlineOffset: "2px",
                  }}
                >
                  Add a project
                </button>{" "}
                or{" "}
                {onSettingsClick ? (
                  <button
                    onClick={onSettingsClick}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: "0.75rem",
                      padding: 0,
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                  >
                    connect a data source
                  </button>
                ) : (
                  "connect a data source"
                )}{" "}
                to auto-detect them.
              </>
            )}
          </div>
        )}

        {/* Inferred projects (from datasources) */}
        {inferred.map((p, i) => (
          <div
            key={`inferred-${i}`}
            className="feed-item"
            onClick={() => onPrefill(`What's the latest on ${p.name}?`)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                {p.name}
              </span>
              <span
                className={`tag ${p.status === "Active" ? "tag-green" : "tag-yellow"}`}
              >
                {p.status}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginTop: "0.15rem",
              }}
            >
              <span className="tag tag-dim">{p.category}</span>
              {p.tools.slice(0, 3).map((t) => (
                <span
                  key={t}
                  style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                >
                  {t}
                </span>
              ))}
            </div>
            {p.recent_activity?.[0] && (
              <div className="feed-title" style={{ marginTop: "0.2rem" }}>
                {p.recent_activity[0].event}
              </div>
            )}
          </div>
        ))}

        {/* Manual projects */}
        {manualProjects.map((p) => (
          <div
            key={p.id}
            className="feed-item"
            onClick={() => onPrefill(`What's the latest on ${p.name}?`)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: p.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  {p.name}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(p.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.75rem",
                  padding: "0 0.15rem",
                  opacity: 0,
                  transition: "opacity 0.1s",
                }}
                className="project-delete"
                title="Remove project"
              >
                &times;
              </button>
            </div>
          </div>
        ))}

        {/* Create project inline form */}
        {showCreate && (
          <div style={{ padding: "0.25rem 0" }}>
            <input
              ref={createRef}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onBlur={handleCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setCreateName("");
                  setShowCreate(false);
                }
              }}
              placeholder="Project name..."
              style={{
                width: "100%",
                background: "var(--bg)",
                border: "1px solid var(--border-light)",
                borderRadius: 3,
                padding: "0.3rem 0.4rem",
                fontSize: "0.75rem",
                color: "var(--text)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
