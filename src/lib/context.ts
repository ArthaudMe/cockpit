import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { buildSkillsPromptSection } from "./skills";

// Still used by ContextColumn, FeedColumn for mock data display
import contextData from "../../context.json";
export type Context = typeof contextData;

export function getContext(): Context {
  return contextData;
}

type Profile = {
  name: string;
  role: string;
  company: string;
};

type Project = {
  id: string;
  name: string;
  color: string;
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

function loadProjects(): Project[] {
  try {
    const p = join(homedir(), ".cockpit", "projects.json");
    if (!existsSync(p)) return [];
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return [];
  }
}

export function buildSystemPrompt(): string {
  const profile = loadProfile();
  const projects = loadProjects();

  const userName = profile.name || "the user";
  const roleLine = profile.role ? ` Their role is ${profile.role}.` : "";
  const companyLine = profile.company ? ` They work at ${profile.company}.` : "";

  const projectList = projects.length > 0
    ? `\n\n## Active Projects\n${projects.map((p) => `- ${p.name}`).join("\n")}`
    : "";

  return `You are a sharp AI co-pilot embedded in Cockpit, a founder's command center. The user is ${userName}.${roleLine}${companyLine}

You have access to their projects, tools, and data sources through Cockpit. Be concise, direct, and actionable — like a sharp chief of staff.${projectList}

When answering questions, be direct. Don't hedge or add unnecessary caveats. If you don't have information, say so clearly rather than making things up.

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

The user will see a button to approve spawning this subagent. Only suggest this when the task is genuinely complex enough to benefit from parallel work. The subagent will appear as a new tab. Roles: general, research, writer, ops.${buildSkillsPromptSection()}`;
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
