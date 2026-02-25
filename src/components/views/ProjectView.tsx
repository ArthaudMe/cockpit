"use client";

import { useState } from "react";
import type { ContextFocus } from "./ContextualChatView";
import {
  focusProjectLinear,
  focusProjectGitHub,
  focusProjectSlack,
  focusMeeting,
  focusPerson,
  focusProject,
  focusIssue,
  focusPR,
  focusSlackChannelMessage,
  focusActivityEvent,
  focusDecision,
} from "@/lib/focus";

type Project = {
  name: string;
  category: string;
  status: string;
  recent_activity: { date: string; event: string; source: string }[];
  key_decisions: string[];
  tools: string[];
  github: {
    repo: string;
    open_prs: number;
    merged_this_week: number;
    commits_this_week: number;
    top_contributors: string[];
    recent_prs: { title: string; author: string; status: string; time: string }[];
    activity_sparkline: number[];
  } | null;
  linear: {
    project: string;
    total_issues: number;
    completed: number;
    in_progress: number;
    backlog: number;
    current_cycle: string | null;
    cycle_progress: number | null;
    recent_issues: { id: string; title: string; assignee: string; state: string; priority: string }[];
  } | null;
  slack: {
    channel: string;
    messages_today: number;
    recent: { author: string; message: string; time: string }[];
  } | null;
  meetings: { title: string; time: string; duration: string; source: string; attendees: string[]; notes: string | null }[];
  people: { name: string; role: string; active_issues: number; commits_this_week: number }[];
};

function Panel({
  title,
  badge,
  onClick,
  children,
}: {
  title: string;
  badge?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="panel" style={{ marginBottom: "0.4rem" }}>
      <div
        className="panel-header"
        style={{ cursor: onClick ? "pointer" : "default" }}
        onClick={onClick}
      >
        <div className="panel-title-row">
          <span className="panel-title">{title}</span>
          {badge && <span className="panel-count">{badge}</span>}
        </div>
        {onClick && (
          <span style={{ fontSize: "0.45rem", color: "var(--accent)", letterSpacing: "0.04em", fontWeight: 600 }}>CHAT →</span>
        )}
      </div>
      <div className="panel-content">{children}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const h = 28;
  const w = 100;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - (v / max) * (h - 4)}`).join(" ");

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <circle key={i} cx={i * step} cy={h - (v / max) * (h - 4)} r="2" fill="var(--green)" />
      ))}
    </svg>
  );
}

function IssueStateTag({ state }: { state: string }) {
  const cls = state === "Done" ? "tag-green" : state === "In Progress" ? "tag-blue" : state === "Todo" ? "tag-dim" : "tag-yellow";
  return <span className={`tag ${cls}`}>{state}</span>;
}

function PriorityDot({ priority }: { priority: string }) {
  const color = priority === "Urgent" ? "var(--red)" : priority === "High" ? "var(--yellow)" : "var(--text-muted)";
  return <span className="dot" style={{ background: color }} />;
}

/** Clickable row wrapper — shows hover state and cursor */
function Clickable({ onClick, children, style }: { onClick: () => void; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="feed-item clickable-row"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={style}
    >
      {children}
    </div>
  );
}

export function ProjectView({
  project,
  onBack,
  onPrefill,
  onOpenFocus,
}: {
  project: Project;
  onBack: () => void;
  onPrefill: (text: string) => void;
  onOpenFocus?: (focus: ContextFocus) => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "issues" | "activity">("overview");
  const linear = project.linear;
  const github = project.github;
  const slack = project.slack;

  const chat = (focus: ContextFocus) => {
    if (onOpenFocus) onOpenFocus(focus);
    else onPrefill(focus.suggestedQuestions[0] || `Tell me about ${focus.title}`);
  };

  return (
    <div className="panel" style={{ height: "100%", display: "flex", flexDirection: "column", marginBottom: 0 }}>
      {/* Header */}
      <div className="panel-header" style={{ cursor: "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button onClick={onBack} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 3, color: "var(--text-dim)", fontSize: "0.55rem", padding: "0.15rem 0.4rem", cursor: "pointer" }}>
            ← BACK
          </button>
          <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text)" }}>{project.name}</span>
          <span className={`tag ${project.status === "Active" ? "tag-green" : "tag-yellow"}`}>{project.status}</span>
          <span className="tag tag-dim">{project.category}</span>
        </div>
        <button
          onClick={() => chat(focusProject(project as any))}
          style={{ background: "var(--accent)", border: "none", borderRadius: 3, color: "var(--bg)", fontSize: "0.5rem", padding: "0.2rem 0.5rem", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, fontFamily: "inherit" }}
        >
          ⌘ Agent Chat
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", padding: "0 0.5rem" }}>
        {(["overview", "issues", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none", border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              color: activeTab === tab ? "var(--text)" : "var(--text-muted)",
              fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase",
              letterSpacing: "0.05em", padding: "0.4rem 0.75rem", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>

        {/* ===================== OVERVIEW TAB ===================== */}
        {activeTab === "overview" && (
          <div>
            {/* Metric cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.4rem", marginBottom: "0.5rem" }}>
              {linear && (
                <>
                  <MetricCard label="ISSUES" value={`${linear.completed}/${linear.total_issues}`} sub={`${linear.in_progress} in progress`} color="var(--blue)" onClick={() => chat(focusProjectLinear(project as any))} />
                  {linear.current_cycle && (
                    <MetricCard label={linear.current_cycle.toUpperCase()} value={`${Math.round((linear.cycle_progress || 0) * 100)}%`} sub="cycle progress" color="var(--green)" onClick={() => chat(focusProjectLinear(project as any))} />
                  )}
                </>
              )}
              {github && (
                <>
                  <MetricCard label="COMMITS" value={String(github.commits_this_week)} sub="this week" color="var(--green)" onClick={() => chat(focusProjectGitHub(project as any))} />
                  <MetricCard label="PULL REQUESTS" value={`${github.open_prs} open`} sub={`${github.merged_this_week} merged`} color="var(--yellow)" onClick={() => chat(focusProjectGitHub(project as any))} />
                </>
              )}
              {slack && (
                <MetricCard label="SLACK" value={String(slack.messages_today)} sub={`messages in ${slack.channel}`} color="var(--blue)" onClick={() => chat(focusProjectSlack(project as any))} />
              )}
            </div>

            {/* Linear — each issue is clickable */}
            {linear && (
              <Panel title="Linear" badge={linear.project} onClick={() => chat(focusProjectLinear(project as any))}>
                <div style={{ marginBottom: "0.4rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.5rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                    <span>Done {linear.completed}</span>
                    <span>In Progress {linear.in_progress}</span>
                    <span>Backlog {linear.backlog}</span>
                  </div>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", gap: 1 }}>
                    <div style={{ width: `${(linear.completed / linear.total_issues) * 100}%`, background: "var(--green)" }} />
                    <div style={{ width: `${(linear.in_progress / linear.total_issues) * 100}%`, background: "var(--blue)" }} />
                    <div style={{ width: `${(linear.backlog / linear.total_issues) * 100}%`, background: "var(--border-light)" }} />
                  </div>
                </div>
                {linear.recent_issues.slice(0, 3).map((issue) => (
                  <Clickable key={issue.id} onClick={() => chat(focusIssue(issue, project.name))}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <PriorityDot priority={issue.priority} />
                      <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", flexShrink: 0 }}>{issue.id}</span>
                      <span className="feed-title" style={{ flex: 1 }}>{issue.title}</span>
                      <IssueStateTag state={issue.state} />
                    </div>
                  </Clickable>
                ))}
              </Panel>
            )}

            {/* GitHub — each PR is clickable */}
            {github && (
              <Panel title="GitHub" badge={github.repo} onClick={() => chat(focusProjectGitHub(project as any))}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <div style={{ fontSize: "0.55rem", color: "var(--text-dim)" }}>Commits (7d)</div>
                  <Sparkline data={github.activity_sparkline} />
                </div>
                {github.recent_prs.map((pr, i) => (
                  <Clickable key={i} onClick={() => chat(focusPR(pr, project.name, github.repo))}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="feed-title" style={{ flex: 1 }}>{pr.title}</span>
                      <span className={`tag ${pr.status === "merged" ? "tag-green" : "tag-yellow"}`}>{pr.status}</span>
                    </div>
                    <div className="feed-meta">
                      <span className="feed-time">{pr.author}</span>
                      <span className="feed-time">{pr.time}</span>
                    </div>
                  </Clickable>
                ))}
              </Panel>
            )}

            {/* People — each person clickable */}
            <Panel title="People" badge={String(project.people.length)}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "0.35rem" }}>
                {project.people.map((person) => (
                  <div
                    key={person.name}
                    onClick={() => chat(focusPerson(person, project.name))}
                    className="clickable-row"
                    style={{ background: "rgba(255,255,255,0.02)", borderRadius: 3, padding: "0.4rem", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text)" }}>{person.name}</div>
                    <div style={{ fontSize: "0.5rem", color: "var(--text-muted)" }}>{person.role}</div>
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.2rem" }}>
                      {person.active_issues > 0 && <span style={{ fontSize: "0.5rem", color: "var(--blue)" }}>{person.active_issues} issues</span>}
                      {person.commits_this_week > 0 && <span style={{ fontSize: "0.5rem", color: "var(--green)" }}>{person.commits_this_week} commits</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Meetings — each meeting clickable */}
            {project.meetings.length > 0 && (
              <Panel title="Meetings" badge={String(project.meetings.length)}>
                {project.meetings.map((m, i) => (
                  <Clickable key={i} onClick={() => chat(focusMeeting(m, project.name))}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="feed-title">{m.title}</span>
                      <span className="tag tag-dim">{m.source}</span>
                    </div>
                    <div className="feed-meta">
                      <span style={{ fontSize: "0.6rem", color: "var(--accent)" }}>{m.time}</span>
                      <span className="feed-time">{m.duration}</span>
                      <span className="feed-time">{m.attendees.join(", ")}</span>
                    </div>
                    {m.notes && (
                      <div style={{ fontSize: "0.55rem", color: "var(--text-dim)", marginTop: "0.15rem", fontStyle: "italic" }}>{m.notes}</div>
                    )}
                  </Clickable>
                ))}
              </Panel>
            )}

            {/* Slack — each message clickable */}
            {slack && (
              <Panel title="Slack" badge={slack.channel} onClick={() => chat(focusProjectSlack(project as any))}>
                {slack.recent.map((msg, i) => (
                  <Clickable key={i} onClick={() => chat(focusSlackChannelMessage(msg, slack.channel, project.name))}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.6rem", fontWeight: 600, color: "var(--text)" }}>{msg.author}</span>
                      <span className="feed-time">{msg.time}</span>
                    </div>
                    <div className="feed-title">{msg.message}</div>
                  </Clickable>
                ))}
              </Panel>
            )}

            {/* Key Decisions — each decision clickable */}
            {project.key_decisions.length > 0 && (
              <Panel title="Key Decisions" badge={String(project.key_decisions.length)}>
                {project.key_decisions.map((d, i) => (
                  <Clickable key={i} onClick={() => chat(focusDecision(d, project.name))}>
                    <div style={{ fontSize: "0.6rem", color: "var(--text-dim)", lineHeight: 1.4, paddingLeft: "0.5rem", borderLeft: "2px solid var(--border-light)" }}>
                      {d}
                    </div>
                  </Clickable>
                ))}
              </Panel>
            )}
          </div>
        )}

        {/* ===================== ISSUES TAB ===================== */}
        {activeTab === "issues" && linear && (
          <div>
            <Panel title="All Issues" badge={String(linear.total_issues)}>
              {linear.recent_issues.map((issue) => (
                <Clickable key={issue.id} onClick={() => chat(focusIssue(issue, project.name))}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <PriorityDot priority={issue.priority} />
                    <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", flexShrink: 0, width: 55 }}>{issue.id}</span>
                    <span className="feed-title" style={{ flex: 1 }}>{issue.title}</span>
                    <span style={{ fontSize: "0.5rem", color: "var(--text-muted)", flexShrink: 0 }}>{issue.assignee}</span>
                    <IssueStateTag state={issue.state} />
                  </div>
                </Clickable>
              ))}
            </Panel>
          </div>
        )}

        {activeTab === "issues" && !linear && (
          <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--text-muted)", fontSize: "0.6rem" }}>
            No Linear project connected
          </div>
        )}

        {/* ===================== ACTIVITY TAB ===================== */}
        {activeTab === "activity" && (
          <div>
            <Panel title="Timeline">
              {project.recent_activity.map((a, i) => (
                <Clickable key={i} onClick={() => chat(focusActivityEvent(a, project.name))}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="feed-title">{a.event}</span>
                    <span className="tag tag-dim">{a.source}</span>
                  </div>
                  <span className="feed-time">{a.date}</span>
                </Clickable>
              ))}
              {slack && slack.recent.map((msg, i) => (
                <Clickable key={`slack-${i}`} onClick={() => chat(focusSlackChannelMessage(msg, slack.channel, project.name))}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="feed-title">{msg.author}: {msg.message}</span>
                    <span className="tag tag-dim">Slack</span>
                  </div>
                  <span className="feed-time">{msg.time}</span>
                </Clickable>
              ))}
              {github && github.recent_prs.map((pr, i) => (
                <Clickable key={`pr-${i}`} onClick={() => chat(focusPR(pr, project.name, github.repo))}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span className="feed-title">{pr.title}</span>
                    <span className={`tag ${pr.status === "merged" ? "tag-green" : "tag-yellow"}`}>{pr.status}</span>
                  </div>
                  <div className="feed-meta">
                    <span className="feed-time">{pr.author}</span>
                    <span className="feed-time">{pr.time}</span>
                    <span className="tag tag-dim">GitHub</span>
                  </div>
                </Clickable>
              ))}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color, onClick }: { label: string; value: string; sub: string; color: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={onClick ? "clickable-row" : ""}
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.5rem",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color }}>{value}</div>
      <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{sub}</div>
    </div>
  );
}
