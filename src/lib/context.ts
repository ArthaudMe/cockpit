import contextData from "../../context.json";
import type { DatasourceData } from "./datasources/types";

export type Context = typeof contextData;

export function getContext(): Context {
  return contextData;
}

export function buildSystemPrompt(ctx: Context, live?: DatasourceData): string {
  const projects = ctx.projects
    .map((p) => {
      const activities = p.recent_activity
        .map((a) => `  - [${a.date}] ${a.event} (${a.source})`)
        .join("\n");
      const decisions = p.key_decisions.length
        ? `  Key decisions:\n${p.key_decisions.map((d) => `  - ${d}`).join("\n")}`
        : "";
      return `### ${p.name} (${p.category} — ${p.status})\n  Tools: ${p.tools.join(", ")}\n  Recent activity:\n${activities}${decisions ? "\n" + decisions : ""}`;
    })
    .join("\n\n");

  // Use live calendar data if available, fall back to static
  const calendarData = live?.calendar?.length
    ? live.calendar
        .map(
          (m) =>
            `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
        )
        .join("\n")
    : ctx.calendar
        .map(
          (m) =>
            `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
        )
        .join("\n");

  const analytics = Object.entries(ctx.usage_analytics)
    .map(([key, v]) => {
      const label = key.toUpperCase();
      const unit = "unit" in v ? v.unit : "";
      return `- ${label}: ${v.value}${unit} (${v.change} over ${v.period})`;
    })
    .join("\n");

  // Use live Slack data if available
  const slack = live?.slackMessages?.length
    ? live.slackMessages
        .map((s) => `- ${s.channel} (${s.time}): ${s.author}: ${s.message}`)
        .join("\n")
    : ctx.slack_highlights
        .map((s) => `- ${s.channel} (${s.time}): ${s.message}`)
        .join("\n");

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

  return `You are Mio, an AI work companion embedded in a founder's cockpit. The user is ${ctx.user}. They see a sidebar with their calendar, projects, analytics, Slack, competitor updates, and todo. You have persistent context about their work across all tools.

Here is what you know:

## Current Projects
${projects}

## Today's Calendar
${calendarData}

## Key Metrics
${analytics}

## Recent Slack Activity
${slack}

## Competitor Intel
${competitors}

## Todo List
${todos}${liveLinear}${liveGitHub}${liveEmails}${liveNotion}${liveGranola}

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
