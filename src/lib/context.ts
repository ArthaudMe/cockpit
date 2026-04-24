import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { buildSkillsPromptSection } from "./skills";
import { buildMemoryPromptSection } from "./memory";
import { searchHistory } from "./knowledge/search";
import type { DatasourceData } from "./datasources/types";

// Re-export client-safe types and functions so server-side consumers
// can keep importing from "@/lib/context" unchanged.
export { type Context, buildContextFromLiveData, getContextStats } from "./context-client";
import type { Context } from "./context-client";

const EMPTY_CONTEXT: Context = {
  user: "User",
  projects: [],
  calendar: [],
  usage_analytics: {},
  slack_highlights: [],
  competitor_updates: [],
  todos: [],
  company_feed: [],
  connected: {},
};

export function getContext(): Context {
  return EMPTY_CONTEXT;
}

type Profile = {
  name: string;
  role: string;
  company: string;
};

function loadProfile(): Profile {
  try {
    const p = join(homedir(), ".cockpit", "profile.json");
    if (!existsSync(p)) return { name: "", role: "", company: "" };
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return { name: "", role: "", company: "" };
  }
}

export function buildSystemPrompt(ctx?: Context, live?: DatasourceData, userMessage?: string): string {
  const profile = loadProfile();
  const context = ctx || EMPTY_CONTEXT;

  const userName = profile.name || context.user || "the user";
  const roleLine = profile.role ? ` Their role is ${profile.role}.` : "";
  const companyLine = profile.company ? ` They work at ${profile.company}.` : "";

  const projects = context.projects
    .map((p) => {
      const activities = p.recent_activity
        ?.map((a: any) => `  - [${a.date}] ${a.event} (${a.source})`)
        .join("\n") || "";
      const decisions = p.key_decisions?.length
        ? `  Key decisions:\n${p.key_decisions.map((d: string) => `  - ${d}`).join("\n")}`
        : "";
      return `### ${p.name} (${p.category} — ${p.status})\n  Tools: ${(p.tools || []).join(", ")}\n  Recent activity:\n${activities}${decisions ? "\n" + decisions : ""}`;
    })
    .join("\n\n");

  const calendarData = live?.calendar?.length
    ? live.calendar
        .map(
          (m) =>
            `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
        )
        .join("\n")
    : context.calendar.length
      ? context.calendar
          .map(
            (m) =>
              `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`
          )
          .join("\n")
      : "No calendar events";

  const analytics = Object.keys(context.usage_analytics).length
    ? Object.entries(context.usage_analytics)
        .map(([k, v]) => `- ${k}: ${v.value}${v.unit || ""} (${v.change} ${v.period})`)
        .join("\n")
    : "";

  const slack = live?.slackMessages?.length
    ? live.slackMessages
        .map((s) => `- ${s.channel} (${s.time}): ${s.author}: ${s.message}`)
        .join("\n")
    : context.slack_highlights.length
      ? context.slack_highlights
          .map((s) => `- ${s.channel} (${s.time}): ${s.message}`)
          .join("\n")
      : "No recent Slack activity";

  const competitors = context.competitor_updates.length
    ? context.competitor_updates
        .map((c) => `- ${c.competitor}: ${c.event} (${c.source}, ${c.time})`)
        .join("\n")
    : "";

  const todos = context.todos.length
    ? context.todos
        .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
        .join("\n")
    : "";

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

  const liveMcp = live?.mcpResources?.length
    ? `\n\n## MCP Data Sources\n${live.mcpResources
        .map((r) => `- [${r.serverName}] ${r.name}: ${r.text.slice(0, 200)}`)
        .join("\n")}`
    : "";

  // Historical context: search past items relevant to the user's message
  let historicalContext = "";
  if (userMessage) {
    try {
      const results = searchHistory({ query: userMessage, limit: 5 });
      if (results.length > 0) {
        const lines = results.map((r) => {
          const dateStr = r.timestamp ? r.timestamp.split("T")[0] : "";
          const snippet = r.snippet ? `: ${r.snippet.slice(0, 80)}` : "";
          return `- [${r.source}, ${dateStr}] ${r.title}${snippet}`;
        });
        historicalContext = `\n\n## Historical Context\nThe following past items may be relevant:\n${lines.join("\n")}`;
      }
    } catch {
      // Never let search failures affect prompt building
    }
  }

  return `You are a sharp AI co-pilot embedded in Cockpit, a founder's command center. The user is ${userName}.${roleLine}${companyLine}

You have access to their projects, tools, and data sources through Cockpit. Be concise, direct, and actionable — like a sharp chief of staff.

## Brain-First Protocol

IMPORTANT: Before suggesting external lookups or asking the user for information, ALWAYS check what you already know:
1. **Memory** — Check your Notes and User Profile below for relevant context
2. **Historical Context** — Check the historical items below for past data
3. **Live Data** — Check the live datasource sections (Calendar, Linear, GitHub, Slack, etc.) already provided
4. **Only then** — If the information is not in any of the above, say what you're missing and offer to look it up

Never ask "can you share your calendar?" if calendar data is already below. Never ask "what project is this for?" if the project list has it. Use what you have first.

Here is what you know:
${projects ? `\n## Current Projects\n${projects}` : ""}
## Today's Calendar
${calendarData}
${analytics ? `\n## Key Metrics\n${analytics}` : ""}
## Recent Slack Activity
${slack}
${competitors ? `\n## Competitor Intel\n${competitors}` : ""}
${todos ? `\n## Todo List\n${todos}` : ""}${liveLinear}${liveGitHub}${liveEmails}${liveNotion}${liveGranola}${liveMcp}${historicalContext}
${buildMemoryPromptSection()}

When answering questions, use this context naturally. Don't say "based on the context I was given" — just answer as if you naturally know this information. Be concise and direct, like a sharp chief of staff. If you don't have information, say so clearly rather than making things up.

IMPORTANT: When your response contains structured data that would benefit from visual rendering, output it as a JSON code block with a \`cockpit_render\` key. This renders as rich UI inline in the chat. Supported types:

**table** — for comparisons, metrics, lists:
\`\`\`json
{
  "cockpit_render": "table",
  "title": "Example",
  "columns": ["Col1", "Col2"],
  "rows": [["val1", "val2"]]
}
\`\`\`

**bar_chart** — for numeric comparisons:
\`\`\`json
{
  "cockpit_render": "bar_chart",
  "title": "Example",
  "data": [{"label": "A", "value": 100}]
}
\`\`\`

**card_grid** — for project summaries, activity feeds:
\`\`\`json
{
  "cockpit_render": "card_grid",
  "title": "Example",
  "cards": [{"title": "Card", "status": "Active", "subtitle": "Info", "items": ["Item 1"]}]
}
\`\`\`

**layout** — for side-by-side comparisons:
\`\`\`json
{
  "cockpit_render": "layout",
  "direction": "row",
  "children": [
    { "cockpit_render": "bar_chart", "title": "Revenue", "data": [{"label": "Q1", "value": 100}] },
    { "cockpit_render": "table", "title": "Details", "columns": ["Quarter", "Revenue"], "rows": [["Q1", "100"]] }
  ]
}
\`\`\`

**mermaid** — for diagrams and flowcharts:
\`\`\`json
{
  "cockpit_render": "mermaid",
  "title": "Auth Flow",
  "code": "graph TD\\n  A[User] --> B[Login]\\n  B --> C[Dashboard]"
}
\`\`\`

Use these render types when the data would look better visually than as plain text. Mix them with regular markdown text naturally.

## Subagent Delegation

When a task would benefit from specialized parallel work (e.g. research while you draft, or multiple independent analyses), you can suggest spawning a subagent. Output a JSON code block with a \`cockpit_subagent\` key:

\`\`\`json
{
  "cockpit_subagent": true,
  "name": "Research Agent",
  "role": "research",
  "task": "Research the top 5 competitors in the project management space and compare their pricing"
}
\`\`\`

The user will see a button to approve spawning this subagent. Only suggest this when the task is genuinely complex enough to benefit from parallel work. The subagent will appear as a new tab. Roles: general, research, writer, ops.

## Actions

You can propose actions that the user can approve and execute directly from chat. Output a JSON code block with a \`cockpit_action\` key:

\`\`\`json
{
  "cockpit_action": "linear_create_issue",
  "params": { "title": "...", "description": "...", "teamId": "...", "priority": 2 },
  "confirm": true
}
\`\`\`

Available actions:
- **linear_create_issue** — Create a Linear issue. Params: title (required), description, teamId (required), priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)
- **github_comment_pr** — Comment on a GitHub pull request. Params: owner (required), repo (required), pull_number (required), body (required)
- **slack_send_message** — Send a Slack message. Params: channel (required, channel name or ID), text (required)
- **calendar_create_event** — Create a Google Calendar event. Params: summary (required), start (required, ISO datetime), end (required, ISO datetime), description, attendees (array of emails)
- **gmail_draft** — Create a Gmail draft. Params: to (required, email), subject (required), body (required)
- **notion_update_page** — Append content to a Notion page. Params: pageId (required), content (required, text with newlines for paragraphs)

Always set \`confirm: true\` so the user can review and approve the action before it executes. The action will render as a card with Execute/Cancel buttons.

## Skill Creator

You can create, update, or delete custom skills. When you notice a workflow that could be reusable — a specific analysis pattern, a reporting format, a decision framework the user likes — propose saving it as a skill. Output a JSON code block:

\`\`\`json
{
  "cockpit_skill": true,
  "action": "create",
  "name": "Weekly Standup Summary",
  "slash": "/standup",
  "icon": "◎",
  "description": "Summarize this week's progress across all projects",
  "category": "leadership",
  "promptInstruction": "When the user asks for a standup summary: ...",
  "triggerHints": ["standup", "weekly update", "status report"],
  "outputFormat": "card_grid + table"
}
\`\`\`

Actions:
- **create**: Save a new custom skill. Requires name, promptInstruction. The user will see a card to approve.
- **update**: Modify an existing custom skill. Requires id + fields to change.
- **delete**: Remove a custom skill. Requires id.

Categories: leadership, product, strategy, growth.

**When to propose skills:**
- After a multi-step interaction the user found valuable ("that was useful, can you do that again?")
- When you notice a recurring pattern in the user's requests
- When the user explicitly asks to save a workflow
- Do NOT propose skills for one-off tasks. Only for genuinely reusable workflows.

The skill will render as a purple card with Save/Dismiss buttons. Once saved, it becomes available as a slash command immediately.${buildSkillsPromptSection()}`;
}

