"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Project = {
  id: string;
  name: string;
  color: string;
};

function Panel({
  title,
  count,
  defaultOpen = true,
  onAdd,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  onAdd?: () => void;
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
                fontSize: "0.65rem",
                padding: "0 0.2rem",
                lineHeight: 1,
              }}
              title="Add project"
            >
              +
            </button>
          )}
          <span className={`panel-toggle ${open ? "open" : ""}`}>▶</span>
        </div>
      </div>
      {open && <div className="panel-content">{children}</div>}
    </div>
  );
}

export function ProjectsColumn({
  onPrefill,
  onProjectClick,
  selectedId,
}: {
  onPrefill: (text: string) => void;
  onProjectClick?: (project: Project) => void;
  selectedId?: string | null;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const createRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => setProjects(data))
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
        const project: Project = await res.json();
        setProjects((prev) => [...prev, project]);
      }
    } catch {}
    setCreateName("");
    setShowCreate(false);
  }, [createName]);

  const handleDelete = useCallback(async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => createRef.current?.focus(), 0);
    }
  }, [showCreate]);

  return (
    <div>
      <Panel
        title="Projects"
        count={projects.length}
        onAdd={projects.length < 5 ? () => setShowCreate(true) : undefined}
      >
        {projects.length === 0 && !showCreate && (
          <div
            style={{
              padding: "0.75rem 0.25rem",
              fontSize: "0.55rem",
              color: "var(--text-muted)",
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
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
                fontSize: "0.55rem",
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: "2px",
              }}
            >
              Add a project
            </button>{" "}
            or connect a data source to auto-detect them.
          </div>
        )}

        {projects.map((p) => (
          <div
            key={p.id}
            className="feed-item"
            onClick={() =>
              onProjectClick
                ? onProjectClick(p)
                : onPrefill(`What's the latest on ${p.name}?`)
            }
            style={{
              background: selectedId === p.id ? "var(--surface-hover)" : undefined,
              margin: selectedId === p.id ? "0 -0.5rem" : undefined,
              padding: selectedId === p.id ? "0.4rem 0.5rem" : undefined,
              borderRadius: selectedId === p.id ? 4 : undefined,
              borderLeft: selectedId === p.id ? "2px solid var(--accent)" : undefined,
            }}
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
                    fontSize: "0.65rem",
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
                  fontSize: "0.5rem",
                  padding: "0 0.15rem",
                  opacity: 0,
                  transition: "opacity 0.1s",
                }}
                className="project-delete"
                title="Remove project"
              >
                ×
              </button>
            </div>
          </div>
        ))}

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
                fontSize: "0.6rem",
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
