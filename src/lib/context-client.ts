import type { DatasourceData } from "./datasources/types";

export interface Context {
  user: string;
  projects: any[];
  calendar: { title: string; time: string; date?: string; duration: string; attendees: string[] }[];
  usage_analytics: Record<string, { value: number; change: string; period: string; unit?: string }>;
  slack_highlights: { channel: string; message: string; time: string }[];
  competitor_updates: { competitor: string; event: string; source: string; time: string }[];
  todos: { text: string; done: boolean }[];
  company_feed: { type: string; actor: string; event: string; project: string | null; time: string; icon: string; detail?: string }[];
  connected: Record<string, boolean>;
}

/** Parse relative time strings like "2h ago", "3d ago", "just now" to minutes for sorting */
function parseRelativeTime(time: string): number {
  if (!time) return Infinity;
  const t = time.toLowerCase();
  if (t.includes("just now")) return 0;

  const match = t.match(/(\d+)\s*(m|h|d)\s*ago/);
  if (match) {
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    if (unit === "m") return n;
    if (unit === "h") return n * 60;
    if (unit === "d") return n * 60 * 24;
  }

  const clockMatch = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (clockMatch) {
    let hours = parseInt(clockMatch[1], 10);
    const mins = parseInt(clockMatch[2], 10);
    const period = clockMatch[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    const now = new Date();
    const eventMinutes = hours * 60 + mins;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return Math.abs(nowMinutes - eventMinutes);
  }

  return Infinity;
}

/** Build a Context from live datasource data */
export function buildContextFromLiveData(live: DatasourceData): Context {
  const calendar = (live.calendar || []).map((e) => ({
    title: e.title,
    time: e.time,
    date: e.date,
    duration: e.duration,
    attendees: e.attendees,
  }));

  const slack_highlights = (live.slackMessages || []).map((s) => ({
    channel: s.channel,
    message: `${s.author}: ${s.message}`,
    time: s.time,
  }));

  const company_feed: Context["company_feed"] = [];

  for (const e of live.calendar || []) {
    company_feed.push({
      type: "meeting",
      actor: e.attendees[0] || "You",
      event: e.title,
      project: null,
      time: e.time,
      icon: "\u{1F4C5}",
    });
  }

  for (const pr of live.githubPRs || []) {
    company_feed.push({
      type: "code",
      actor: pr.author,
      event: `${pr.status === "open" ? "Opened" : "Updated"} PR: ${pr.title}`,
      project: pr.repo,
      time: pr.time,
      icon: pr.status === "open" ? "\u{1F500}" : "\u2705",
      detail: `PR: ${pr.title}\nRepo: ${pr.repo}\nAuthor: ${pr.author}\nStatus: ${pr.status}\nURL: ${pr.url}`,
    });
  }

  for (const n of live.githubNotifications || []) {
    company_feed.push({
      type: "code",
      actor: "GitHub",
      event: `${n.type}: ${n.title}`,
      project: n.repo,
      time: n.time,
      icon: "\u{1F514}",
      detail: `Notification: ${n.title}\nType: ${n.type}\nRepo: ${n.repo}`,
    });
  }

  for (const issue of live.linearIssues || []) {
    company_feed.push({
      type: "code",
      actor: issue.assignee || "Unassigned",
      event: `[${issue.state}] ${issue.title}`,
      project: issue.project || null,
      time: issue.updatedAt,
      icon: "\u{1F4CB}",
      detail: `Issue: ${issue.id} — ${issue.title}\nState: ${issue.state}\nPriority: ${issue.priority}\nAssignee: ${issue.assignee}`,
    });
  }

  for (const s of live.slackMessages || []) {
    company_feed.push({
      type: "message",
      actor: s.author,
      event: s.message,
      project: null,
      time: s.time,
      icon: "\u{1F4AC}",
      detail: `Slack message in ${s.channel} from ${s.author}: ${s.message}`,
    });
  }

  for (const m of live.granolaMeetings || []) {
    company_feed.push({
      type: "meeting",
      actor: m.attendees[0] || "You",
      event: m.title,
      project: null,
      time: m.time,
      icon: "\u{1F399}\uFE0F",
      detail: `Meeting: ${m.title}\nAttendees: ${m.attendees.join(", ") || "none"}\n${m.summary ? `Summary: ${m.summary}` : ""}${m.notes ? `\nNotes: ${m.notes.slice(0, 500)}` : ""}`,
    });
  }

  for (const p of live.notionPages || []) {
    company_feed.push({
      type: "code",
      actor: "Notion",
      event: `Updated: ${p.title}`,
      project: null,
      time: p.lastEdited,
      icon: "\u{1F4C4}",
      detail: `Notion page: ${p.title}\nLast edited: ${p.lastEdited}\nURL: ${p.url}`,
    });
  }

  for (const e of (live.emails || []).slice(0, 5)) {
    company_feed.push({
      type: "message",
      actor: e.from,
      event: e.subject,
      project: null,
      time: e.time,
      icon: "\u2709\uFE0F",
      detail: `Email from: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}${e.unread ? "\n(Unread)" : ""}`,
    });
  }

  company_feed.sort((a, b) => {
    return parseRelativeTime(a.time) - parseRelativeTime(b.time);
  });

  return {
    user: "Arthaud",
    projects: [],
    calendar,
    usage_analytics: {},
    slack_highlights,
    competitor_updates: [],
    todos: [],
    company_feed,
    connected: live._connected || {},
  };
}

export function getContextStats(ctx: Context) {
  return {
    projects: ctx.projects.length,
    meetings: ctx.calendar.length,
    metrics: Object.keys(ctx.usage_analytics).length,
    slackHighlights: ctx.slack_highlights.length,
    competitors: ctx.competitor_updates.length,
    todos: ctx.todos.length,
  };
}
