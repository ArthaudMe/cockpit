"use client";

import { useState } from "react";

type Project = {
  name: string;
  category: string;
  status: string;
  recent_activity: { date: string; event: string; source: string }[];
  key_decisions: string[];
  tools: string[];
};

function Panel({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
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
        <span className={`panel-toggle ${open ? "open" : ""}`}>▶</span>
      </div>
      {open && <div className="panel-content">{children}</div>}
    </div>
  );
}

export function ProjectsColumn({
  projects,
  onPrefill,
  onProjectClick,
  selectedIndex,
}: {
  projects: Project[];
  onPrefill: (text: string) => void;
  onProjectClick?: (index: number) => void;
  selectedIndex?: number | null;
}) {
  return (
    <div>
      <Panel title="Projects" count={projects.length}>
        {projects.map((p, i) => (
          <div
            key={i}
            className="feed-item"
            onClick={() => onProjectClick ? onProjectClick(i) : onPrefill(`What's the latest on ${p.name}?`)}
            style={{
              background: selectedIndex === i ? "var(--surface-hover)" : undefined,
              margin: selectedIndex === i ? "0 -0.5rem" : undefined,
              padding: selectedIndex === i ? "0.4rem 0.5rem" : undefined,
              borderRadius: selectedIndex === i ? 4 : undefined,
              borderLeft: selectedIndex === i ? "2px solid var(--accent)" : undefined,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>
                {p.name}
              </span>
              <span className={`tag ${p.status === "Active" ? "tag-green" : "tag-yellow"}`}>
                {p.status}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem" }}>
              <span className="tag tag-dim">{p.category}</span>
              {p.tools.slice(0, 3).map((t) => (
                <span key={t} style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>
                  {t}
                </span>
              ))}
            </div>
            {p.recent_activity[0] && (
              <div className="feed-title" style={{ marginTop: "0.2rem" }}>
                {p.recent_activity[0].event}
              </div>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}
