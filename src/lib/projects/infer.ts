import { spawn } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readJsonCached, invalidateFileCache } from "@/lib/fs-cache";
import type {
  DatasourceData,
  LinearIssue,
  GitHubPR,
  SlackMessage,
  CalendarEvent,
  GranolaMeeting,
} from "@/lib/datasources/types";

// ─── Types ──────────────────────────────────────────────────────────

/** The rich Project shape expected by ProjectView */
export interface InferredProject {
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
}

/** LLM output: one cluster mapping per project */
interface ProjectMapping {
  name: string;
  category: string;
  status: string;
  linear_projects: string[];
  github_repos: string[];
  slack_channels: string[];
  meeting_keywords: string[];
}

// ─── Cache ──────────────────────────────────────────────────────────

let cachedResult: InferredProject[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// The LLM clustering (mappings) only depends on the *names* of Linear
// projects / GitHub repos / Slack channels, so it's persisted to disk keyed
// by a hash of those names. App restarts and routine polls reuse it instead
// of spawning a multi-second `claude -p` call; the LLM re-runs only when a
// source appears/disappears or the user forces a refresh.
const MAPPINGS_CACHE_PATH = join(homedir(), ".cockpit", "cache", "project-mappings.json");

interface PersistedMappings {
  key: string;
  mappings: ProjectMapping[];
  savedAt: number;
}

function signalsKey(signals: SignalSummary): string {
  const names = {
    linear: [...signals.linearProjects.keys()].sort(),
    github: [...signals.githubRepos.keys()].sort(),
    slack: [...signals.slackChannels.keys()].sort(),
  };
  return createHash("sha256").update(JSON.stringify(names)).digest("hex").slice(0, 24);
}

function loadPersistedMappings(key: string): ProjectMapping[] | null {
  const stored = readJsonCached<PersistedMappings | null>(MAPPINGS_CACHE_PATH, null);
  if (stored && stored.key === key && Array.isArray(stored.mappings)) {
    return stored.mappings;
  }
  return null;
}

function savePersistedMappings(key: string, mappings: ProjectMapping[]) {
  try {
    mkdirSync(join(homedir(), ".cockpit", "cache"), { recursive: true, mode: 0o700 });
    const payload: PersistedMappings = { key, mappings, savedAt: Date.now() };
    writeFileSync(MAPPINGS_CACHE_PATH, JSON.stringify(payload), { mode: 0o600 });
    invalidateFileCache(MAPPINGS_CACHE_PATH);
  } catch (err) {
    console.error("[projects/infer] failed to persist mappings:", err);
  }
}

// ─── Heuristic grouping ─────────────────────────────────────────────

interface SignalSummary {
  linearProjects: Map<string, LinearIssue[]>;
  githubRepos: Map<string, GitHubPR[]>;
  slackChannels: Map<string, SlackMessage[]>;
  meetings: (CalendarEvent | GranolaMeeting)[];
}

function buildSignals(data: DatasourceData): SignalSummary {
  const linearProjects = new Map<string, LinearIssue[]>();
  for (const issue of data.linearIssues || []) {
    const key = issue.project || "__unassigned__";
    const arr = linearProjects.get(key) || [];
    arr.push(issue);
    linearProjects.set(key, arr);
  }

  const githubRepos = new Map<string, GitHubPR[]>();
  for (const pr of data.githubPRs || []) {
    const arr = githubRepos.get(pr.repo) || [];
    arr.push(pr);
    githubRepos.set(pr.repo, arr);
  }

  const slackChannels = new Map<string, SlackMessage[]>();
  for (const msg of data.slackMessages || []) {
    const arr = slackChannels.get(msg.channel) || [];
    arr.push(msg);
    slackChannels.set(msg.channel, arr);
  }

  const meetings: (CalendarEvent | GranolaMeeting)[] = [
    ...(data.calendar || []),
    ...(data.granolaMeetings || []),
  ];

  return { linearProjects, githubRepos, slackChannels, meetings };
}

// ─── LLM clustering ─────────────────────────────────────────────────

function buildClusteringPrompt(signals: SignalSummary): string {
  const lines: string[] = [];

  if (signals.linearProjects.size > 0) {
    const items = [...signals.linearProjects.entries()]
      .filter(([k]) => k !== "__unassigned__")
      .map(([name, issues]) => `"${name}" (${issues.length} issues)`)
      .join(", ");
    const unassigned = signals.linearProjects.get("__unassigned__");
    const extra = unassigned ? ` + ${unassigned.length} unassigned issues` : "";
    lines.push(`Linear projects: [${items}]${extra}`);
  }

  if (signals.githubRepos.size > 0) {
    const items = [...signals.githubRepos.entries()]
      .map(([repo, prs]) => `"${repo}" (${prs.length} open PRs)`)
      .join(", ");
    lines.push(`GitHub repos: [${items}]`);
  }

  if (signals.slackChannels.size > 0) {
    const items = [...signals.slackChannels.entries()]
      .map(([ch, msgs]) => `"${ch}" (${msgs.length} msgs)`)
      .join(", ");
    lines.push(`Slack channels: [${items}]`);
  }

  if (signals.meetings.length > 0) {
    const titles = signals.meetings.slice(0, 15).map((m) => `"${m.title}"`).join(", ");
    lines.push(`Recent meetings: [${titles}]`);
  }

  return `You are analyzing a user's connected work tools to identify their active projects. Given these signals, cluster them into coherent projects.

${lines.join("\n")}

For each project you identify, return:
- name: concise project name
- category: one of "Product", "Engineering", "Sales", "Operations", "Marketing", "Other"
- status: one of "Active", "Planning", "Paused"
- linear_projects: array of matching Linear project names (exact strings from above)
- github_repos: array of matching GitHub repo names (exact strings from above)
- slack_channels: array of matching Slack channel names (exact strings from above)
- meeting_keywords: array of lowercase keywords to match meetings to this project

Rules:
- Merge items that clearly belong to the same project (e.g. repo "mio-xyz/platform" and Linear project "Mio Platform")
- A Slack channel like "#platform-dev" likely maps to a platform project
- Only create projects for items that have real signals — don't invent projects
- Unassigned Linear issues: try to map them to a project by title similarity, otherwise skip them

Respond with ONLY a valid JSON array. No markdown, no explanation.
Example: [{"name":"Platform","category":"Product","status":"Active","linear_projects":["Platform"],"github_repos":["org/platform"],"slack_channels":["#platform-dev"],"meeting_keywords":["platform","standup"]}]`;
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", "--output-format", "text"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv(),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `Exit code ${code}`));
      else resolve(stdout.trim());
    });

    proc.on("error", (err) => reject(err));

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}

// ─── Assembly ───────────────────────────────────────────────────────

function assembleProject(
  mapping: ProjectMapping,
  signals: SignalSummary,
): InferredProject {
  // Collect matched Linear issues
  const linearIssues: LinearIssue[] = [];
  for (const projName of mapping.linear_projects) {
    const issues = signals.linearProjects.get(projName);
    if (issues) linearIssues.push(...issues);
  }

  // Collect matched GitHub PRs
  const githubPRs: GitHubPR[] = [];
  for (const repo of mapping.github_repos) {
    const prs = signals.githubRepos.get(repo);
    if (prs) githubPRs.push(...prs);
  }

  // Collect matched Slack messages
  const slackMessages: SlackMessage[] = [];
  for (const channel of mapping.slack_channels) {
    const msgs = signals.slackChannels.get(channel);
    if (msgs) slackMessages.push(...msgs);
  }

  // Match meetings by keywords
  const keywords = mapping.meeting_keywords.map((k) => k.toLowerCase());
  const matchedMeetings = signals.meetings.filter((m) =>
    keywords.some((kw) => m.title.toLowerCase().includes(kw))
  );

  // Build tools list
  const tools: string[] = [];
  if (linearIssues.length > 0) tools.push("Linear");
  if (githubPRs.length > 0) tools.push("GitHub");
  if (slackMessages.length > 0) tools.push("Slack");
  if (matchedMeetings.length > 0) tools.push("Calendar");

  // Build recent_activity from all sources
  const recent_activity: { date: string; event: string; source: string }[] = [];
  for (const issue of linearIssues.slice(0, 3)) {
    recent_activity.push({ date: issue.updatedAt, event: `[${issue.state}] ${issue.title}`, source: "Linear" });
  }
  for (const pr of githubPRs.slice(0, 3)) {
    recent_activity.push({ date: pr.time, event: `PR: ${pr.title} (${pr.status})`, source: "GitHub" });
  }
  for (const msg of slackMessages.slice(0, 2)) {
    recent_activity.push({ date: msg.time, event: `${msg.author}: ${msg.message}`, source: "Slack" });
  }

  // Build linear sub-object
  let linear: InferredProject["linear"] = null;
  if (linearIssues.length > 0) {
    const completed = linearIssues.filter((i) => i.state === "Done").length;
    const inProgress = linearIssues.filter((i) => i.state === "In Progress").length;
    const backlog = linearIssues.length - completed - inProgress;
    linear = {
      project: mapping.linear_projects[0] || mapping.name,
      total_issues: linearIssues.length,
      completed,
      in_progress: inProgress,
      backlog,
      current_cycle: null,
      cycle_progress: null,
      recent_issues: linearIssues.slice(0, 10).map((i) => ({
        id: i.id,
        title: i.title,
        assignee: i.assignee,
        state: i.state,
        priority: i.priority,
      })),
    };
  }

  // Build github sub-object
  let github: InferredProject["github"] = null;
  if (githubPRs.length > 0) {
    const repo = mapping.github_repos[0] || githubPRs[0].repo;
    const openPRs = githubPRs.filter((pr) => pr.status === "open").length;
    const mergedPRs = githubPRs.filter((pr) => pr.status === "merged").length;
    const contributors = [...new Set(githubPRs.map((pr) => pr.author))];
    github = {
      repo,
      open_prs: openPRs,
      merged_this_week: mergedPRs,
      commits_this_week: 0,
      top_contributors: contributors,
      recent_prs: githubPRs.slice(0, 5).map((pr) => ({
        title: pr.title,
        author: pr.author,
        status: pr.status,
        time: pr.time,
      })),
      activity_sparkline: [0, 0, 0, 0, 0, githubPRs.length, 0],
    };
  }

  // Build slack sub-object
  let slack: InferredProject["slack"] = null;
  if (slackMessages.length > 0) {
    slack = {
      channel: mapping.slack_channels[0] || slackMessages[0].channel,
      messages_today: slackMessages.length,
      recent: slackMessages.slice(0, 5).map((s) => ({
        author: s.author,
        message: s.message,
        time: s.time,
      })),
    };
  }

  // Build meetings
  const meetings = matchedMeetings.slice(0, 5).map((m) => ({
    title: m.title,
    time: m.time,
    duration: "duration" in m ? m.duration : "—",
    source: "source" in m ? m.source : "Granola",
    attendees: m.attendees,
    notes: "notes" in m && m.notes ? m.notes : null,
  }));

  // Build people from contributors
  const peopleMap = new Map<string, { issues: number; commits: number; role: string }>();
  for (const issue of linearIssues) {
    if (!issue.assignee) continue;
    const p = peopleMap.get(issue.assignee) || { issues: 0, commits: 0, role: "Engineer" };
    p.issues++;
    peopleMap.set(issue.assignee, p);
  }
  for (const pr of githubPRs) {
    const p = peopleMap.get(pr.author) || { issues: 0, commits: 0, role: "Engineer" };
    p.commits++;
    peopleMap.set(pr.author, p);
  }
  const people = [...peopleMap.entries()].map(([name, stats]) => ({
    name,
    role: stats.role,
    active_issues: stats.issues,
    commits_this_week: stats.commits,
  }));

  return {
    name: mapping.name,
    category: mapping.category,
    status: mapping.status,
    recent_activity,
    key_decisions: [],
    tools,
    github,
    linear,
    slack,
    meetings,
    people,
  };
}

// ─── Heuristic-only fallback (no LLM) ──────────────────────────────

function heuristicProjects(signals: SignalSummary): InferredProject[] {
  const projects: InferredProject[] = [];

  // One project per Linear project name
  for (const [name, issues] of signals.linearProjects) {
    if (name === "__unassigned__") continue;
    const mapping: ProjectMapping = {
      name,
      category: "Engineering",
      status: "Active",
      linear_projects: [name],
      github_repos: [],
      slack_channels: [],
      meeting_keywords: [name.toLowerCase().split(/\s+/)[0]],
    };
    projects.push(assembleProject(mapping, signals));
  }

  // One project per GitHub repo not already covered
  const coveredRepos = new Set(projects.flatMap((p) => p.github ? [p.github.repo] : []));
  for (const [repo] of signals.githubRepos) {
    if (coveredRepos.has(repo)) continue;
    const shortName = repo.split("/").pop() || repo;
    const mapping: ProjectMapping = {
      name: shortName,
      category: "Engineering",
      status: "Active",
      linear_projects: [],
      github_repos: [repo],
      slack_channels: [],
      meeting_keywords: [shortName.toLowerCase()],
    };
    projects.push(assembleProject(mapping, signals));
  }

  return projects;
}

// ─── Main entry ─────────────────────────────────────────────────────

export async function inferProjects(data: DatasourceData): Promise<InferredProject[]> {
  // Check cache
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedResult;
  }

  const signals = buildSignals(data);

  // If there's nothing to cluster, return empty
  const hasData =
    signals.linearProjects.size > 0 ||
    signals.githubRepos.size > 0 ||
    signals.slackChannels.size > 0;

  if (!hasData) {
    cachedResult = [];
    cacheTimestamp = Date.now();
    return [];
  }

  // Start with heuristic projects (instant)
  let projects = heuristicProjects(signals);

  // Reuse the persisted clustering when the source names haven't changed —
  // assembly always runs against the fresh data.
  const key = signalsKey(signals);
  const persisted = loadPersistedMappings(key);
  if (persisted && persisted.length > 0) {
    projects = persisted.map((m) => assembleProject(m, signals));
  } else {
    // Try LLM refinement
    try {
      const prompt = buildClusteringPrompt(signals);
      const result = await askClaude(prompt);
      const jsonStr = result.replace(/```json?\n?/g, "").replace(/```\n?/g, "").trim();
      const mappings: ProjectMapping[] = JSON.parse(jsonStr);

      if (Array.isArray(mappings) && mappings.length > 0) {
        projects = mappings.map((m) => assembleProject(m, signals));
        savePersistedMappings(key, mappings);
      }
    } catch (err) {
      console.error("[projects/infer] LLM clustering failed, using heuristic:", err);
      // Fall through with heuristic projects
    }
  }

  cachedResult = projects;
  cacheTimestamp = Date.now();
  return projects;
}

/** Force-clear the caches so the next call re-runs the LLM clustering */
export function clearInferCache() {
  cachedResult = null;
  cacheTimestamp = 0;
  try {
    rmSync(MAPPINGS_CACHE_PATH, { force: true });
    invalidateFileCache(MAPPINGS_CACHE_PATH);
  } catch {
    // ignore
  }
}
