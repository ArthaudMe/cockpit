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
}

const EMPTY_CONTEXT: Context = {
  user: "User",
  projects: [],
  calendar: [],
  usage_analytics: {},
  slack_highlights: [],
  competitor_updates: [],
  todos: [],
  company_feed: [],
};

export function getContext(): Context {
  return EMPTY_CONTEXT;
}

/** Parse relative time strings like "2h ago", "3d ago", "just now" to minutes for sorting */
function parseRelativeTime(time: string): number {
  if (!time) return Infinity;
  const t = time.toLowerCase();
  if (t.includes("just now")) return 0;

  // Handle "Xm ago", "Xh ago", "Xd ago"
  const match = t.match(/(\d+)\s*(m|h|d)\s*ago/);
  if (match) {
    const [, num, unit] = match;
    const n = parseInt(num, 10);
    if (unit === "m") return n;
    if (unit === "h") return n * 60;
    if (unit === "d") return n * 60 * 24;
  }

  // Handle clock times like "8:30 AM" — treat as today, convert to minutes from midnight
  const clockMatch = t.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (clockMatch) {
    let hours = parseInt(clockMatch[1], 10);
    const mins = parseInt(clockMatch[2], 10);
    const period = clockMatch[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    // Convert to minutes-from-now (approximate: assume "today")
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

  // Add calendar events to feed
  for (const e of live.calendar || []) {
    company_feed.push({
      type: "meeting",
      actor: e.attendees[0] || "You",
      event: e.title,
      project: null,
      time: e.time,
      icon: "📅",
    });
  }

  // Add GitHub PRs to feed
  for (const pr of live.githubPRs || []) {
    company_feed.push({
      type: "code",
      actor: pr.author,
      event: `${pr.status === "open" ? "Opened" : "Updated"} PR: ${pr.title}`,
      project: pr.repo,
      time: pr.time,
      icon: pr.status === "open" ? "🔀" : "✅",
      detail: `PR: ${pr.title}\nRepo: ${pr.repo}\nAuthor: ${pr.author}\nStatus: ${pr.status}\nURL: ${pr.url}`,
    });
  }

  // Add GitHub notifications to feed
  for (const n of live.githubNotifications || []) {
    company_feed.push({
      type: "code",
      actor: "GitHub",
      event: `${n.type}: ${n.title}`,
      project: n.repo,
      time: n.time,
      icon: "🔔",
      detail: `Notification: ${n.title}\nType: ${n.type}\nRepo: ${n.repo}`,
    });
  }

  // Add Linear issues to feed
  for (const issue of live.linearIssues || []) {
    company_feed.push({
      type: "code",
      actor: issue.assignee || "Unassigned",
      event: `[${issue.state}] ${issue.title}`,
      project: issue.project || null,
      time: issue.updatedAt,
      icon: "📋",
      detail: `Issue: ${issue.id} — ${issue.title}\nState: ${issue.state}\nPriority: ${issue.priority}\nAssignee: ${issue.assignee}`,
    });
  }

  // Add Slack messages to feed
  for (const s of live.slackMessages || []) {
    company_feed.push({
      type: "message",
      actor: s.author,
      event: s.message,
      project: null,
      time: s.time,
      icon: "💬",
      detail: `Slack message in ${s.channel} from ${s.author}: ${s.message}`,
    });
  }

  // Add Granola meetings to feed
  for (const m of live.granolaMeetings || []) {
    company_feed.push({
      type: "meeting",
      actor: m.attendees[0] || "You",
      event: m.title,
      project: null,
      time: m.time,
      icon: "🎙️",
      detail: `Meeting: ${m.title}\nAttendees: ${m.attendees.join(", ") || "none"}\n${m.summary ? `Summary: ${m.summary}` : ""}${m.notes ? `\nNotes: ${m.notes.slice(0, 500)}` : ""}`,
    });
  }

  // Add Notion pages to feed
  for (const p of live.notionPages || []) {
    company_feed.push({
      type: "code",
      actor: "Notion",
      event: `Updated: ${p.title}`,
      project: null,
      time: p.lastEdited,
      icon: "📄",
      detail: `Notion page: ${p.title}\nLast edited: ${p.lastEdited}\nURL: ${p.url}`,
    });
  }

  // Add emails to feed
  for (const e of (live.emails || []).slice(0, 5)) {
    company_feed.push({
      type: "message",
      actor: e.from,
      event: e.subject,
      project: null,
      time: e.time,
      icon: "✉️",
      detail: `Email from: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}${e.unread ? "\n(Unread)" : ""}`,
    });
  }

  // Sort feed: most recent first (parse relative times)
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
  };
}

export function buildSystemPrompt(ctx: Context, live?: DatasourceData): string {
  const projects = ctx.projects
    .map((p) => {
      const activities = p.recent_activity
        .map((a: any) => `  - [${a.date}] ${a.event} (${a.source})`)
        .join("\n");
      const decisions = p.key_decisions?.length
        ? `  Key decisions:\n${p.key_decisions.map((d: string) => `  - ${d}`).join("\n")}`
        : "";
      return `### ${p.name} (${p.category} — ${p.status})\n  Tools: ${p.tools.join(", ")}\n  Recent activity:\n${activities}${decisions ? "\n" + decisions : ""}`;
    })
    .join("\n\n");

  const calendarData = live?.calendar?.length
    ? live.calendar
        .map(
          (m) =>
            `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
        )
        .join("\n")
    : ctx.calendar.length
      ? ctx.calendar
          .map(
            (m) =>
              `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
          )
          .join("\n")
      : "No calendar events";

  const analytics = Object.entries(ctx.usage_analytics)
    .map(([key, v]) => {
      const label = key.toUpperCase();
      const unit = "unit" in v ? v.unit : "";
      return `- ${label}: ${v.value}${unit} (${v.change} over ${v.period})`;
    })
    .join("\n");

  const slack = live?.slackMessages?.length
    ? live.slackMessages
        .map((s) => `- ${s.channel} (${s.time}): ${s.author}: ${s.message}`)
        .join("\n")
    : ctx.slack_highlights.length
      ? ctx.slack_highlights
          .map((s) => `- ${s.channel} (${s.time}): ${s.message}`)
          .join("\n")
      : "No recent Slack activity";

  const competitors = ctx.competitor_updates
    .map((c) => `- ${c.competitor} (${c.time}, via ${c.source}): ${c.event}`)
    .join("\n");

  const todos = ctx.todos
    .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
    .join("\n");

  // Live datasource sections
  const liveLinear = live?.linearIssues?.length
    ? `\n\n## Linear Issues (assigned to you)\n${live.linearIssues
        .map(
          (i) =>
            `- ${i.id}: ${i.title} [${i.state}] (${i.priority}) — updated ${i.updatedAt}`
        )
        .join("\n")}`
    : "";

  const liveGitHub = live?.githubPRs?.length
    ? `\n\n## GitHub Pull Requests\n${live.githubPRs
        .map(
          (pr) =>
            `- ${pr.repo}: ${pr.title} by ${pr.author} [${pr.status}] — ${pr.time}`
        )
        .join("\n")}`
    : "";

  const liveEmails = live?.emails?.length
    ? `\n\n## Recent Emails\n${live.emails
        .slice(0, 5)
        .map((e) => `- ${e.from}: ${e.subject} — ${e.snippet.slice(0, 80)}`)
        .join("\n")}`
    : "";

  const liveNotion = live?.notionPages?.length
    ? `\n\n## Recent Notion Pages\n${live.notionPages
        .slice(0, 8)
        .map((p) => `- ${p.title} (edited ${p.lastEdited})`)
        .join("\n")}`
    : "";

  const liveGranola = live?.granolaMeetings?.length
    ? `\n\n## Recent Meeting Notes (Granola)\n${live.granolaMeetings
        .slice(0, 5)
        .map(
          (m) =>
            `- ${m.title} (${m.time}) [${m.attendees.join(", ")}]${m.summary ? `\n  Summary: ${m.summary}` : ""}`
        )
        .join("\n")}`
    : "";

  return `You are the AI assistant embedded in a founder's cockpit. The user is ${ctx.user}. You have persistent context about their work across all connected tools.

Here is what you know:
${projects ? `\n## Current Projects\n${projects}` : ""}
## Today's Calendar
${calendarData}
${analytics ? `\n## Key Metrics\n${analytics}` : ""}
## Recent Slack Activity
${slack}
${competitors ? `\n## Competitor Intel\n${competitors}` : ""}
${todos ? `\n## Todo List\n${todos}` : ""}${liveLinear}${liveGitHub}${liveEmails}${liveNotion}${liveGranola}

When answering questions, use this context naturally. Don't say "based on the context I was given" — just answer as if you naturally know this information. Be concise and direct, like a sharp chief of staff.

IMPORTANT: When your response contains structured data that would benefit from visual rendering, output it as a JSON code block with a \`mio_render\` key. This renders as rich UI inline in the chat. Supported types:

**table** — for comparisons, metrics, lists:
\`\`\`json
{
  "mio_render": "table",
  "title": "Example",
  "columns": ["Col1", "Col2"],
  "rows": [["val1", "val2"]]
}
\`\`\`

**bar_chart** — for numeric comparisons:
\`\`\`json
{
  "mio_render": "bar_chart",
  "title": "Example",
  "data": [{"label": "A", "value": 100}]
}
\`\`\`

**card_grid** — for project summaries, activity feeds:
\`\`\`json
{
  "mio_render": "card_grid",
  "title": "Example",
  "cards": [{"title": "Card", "status": "Active", "subtitle": "Info", "items": ["Item 1"]}]
}
\`\`\`

Use these render types when the data would look better visually than as plain text. Mix them with regular markdown text naturally.`;
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
