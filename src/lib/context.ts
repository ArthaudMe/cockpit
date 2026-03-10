import staticContextData from "../../context.json";
import type { ConnectorData, ProjectData } from "./connectors/types";
import { LinearConnector } from "./connectors/linear";
import { GitHubConnector } from "./connectors/github";
import { GoogleCalendarConnector } from "./connectors/google-calendar";
import { SlackConnector } from "./connectors/slack";
import type { Connector } from "./connectors/types";

export type Context = typeof staticContextData;

// All available connectors
const connectors: Connector[] = [
  new LinearConnector(),
  new GitHubConnector(),
  new GoogleCalendarConnector(),
  new SlackConnector(),
];

export function getConnectorStatuses(): {
  id: string;
  name: string;
  configured: boolean;
}[] {
  return connectors.map((c) => ({
    id: c.id,
    name: c.name,
    configured: c.isConfigured(),
  }));
}

// Cached live context with TTL
let cachedLiveContext: Context | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function invalidateContextCache(): void {
  cachedLiveContext = null;
  cacheTimestamp = 0;
}

/**
 * Returns true if any connector is configured (live mode).
 * Returns false if we're in demo mode (static JSON).
 */
export function isLiveMode(): boolean {
  return connectors.some((c) => c.isConfigured());
}

/**
 * Get context — live from connectors if configured, static JSON otherwise.
 * Uses a 5-minute cache for live data to avoid hammering APIs.
 */
export async function getContextAsync(): Promise<Context> {
  if (!isLiveMode()) {
    return staticContextData;
  }

  // Return cached if fresh
  if (cachedLiveContext && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedLiveContext;
  }

  // Fetch from all configured connectors in parallel
  const configuredConnectors = connectors.filter((c) => c.isConfigured());
  const results = await Promise.allSettled(
    configuredConnectors.map((c) => c.fetchContext()),
  );

  // Merge results
  const merged = mergeConnectorData(
    results
      .filter(
        (r): r is PromiseFulfilledResult<ConnectorData> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value),
  );

  // Build context in the same shape as static JSON, filling gaps with static data
  const liveContext: Context = {
    user: staticContextData.user,
    projects:
      merged.projects.length > 0
        ? (merged.projects as unknown as Context["projects"])
        : staticContextData.projects,
    calendar:
      merged.calendar.length > 0
        ? merged.calendar
        : staticContextData.calendar,
    usage_analytics:
      Object.keys(merged.metrics).length > 0
        ? (merged.metrics as unknown as Context["usage_analytics"])
        : staticContextData.usage_analytics,
    slack_highlights:
      merged.slackHighlights.length > 0
        ? merged.slackHighlights
        : staticContextData.slack_highlights,
    competitor_updates: staticContextData.competitor_updates, // No connector for this yet
    todos: staticContextData.todos, // No connector for this yet
    company_feed:
      merged.feed.length > 0
        ? (merged.feed as unknown as Context["company_feed"])
        : staticContextData.company_feed,
  };

  cachedLiveContext = liveContext;
  cacheTimestamp = Date.now();

  return liveContext;
}

/**
 * Synchronous fallback — returns cached live context or static data.
 * Used by components that can't await.
 */
export function getContext(): Context {
  if (cachedLiveContext) return cachedLiveContext;
  return staticContextData;
}

function mergeConnectorData(results: ConnectorData[]): {
  projects: ProjectData[];
  calendar: Context["calendar"];
  metrics: Record<string, unknown>;
  slackHighlights: Context["slack_highlights"];
  feed: Context["company_feed"];
} {
  const projects: ProjectData[] = [];
  const calendar: Context["calendar"] = [];
  const metrics: Record<string, unknown> = {};
  const slackHighlights: Context["slack_highlights"] = [];
  const feed: Context["company_feed"] = [];

  for (const data of results) {
    if (data.projects) projects.push(...data.projects);
    if (data.calendar) calendar.push(...data.calendar);
    if (data.metrics) Object.assign(metrics, data.metrics);
    if (data.slackHighlights) slackHighlights.push(...data.slackHighlights);
    if (data.feed) feed.push(...(data.feed as unknown as Context["company_feed"]));
  }

  // Sort feed by recency (parse "Xm ago", "Xh ago", etc.)
  feed.sort((a, b) => {
    const parseTime = (t: string) => {
      const m = t.match(/(\d+)(m|h|d)/);
      if (!m) return Infinity;
      const val = parseInt(m[1]);
      if (m[2] === "m") return val;
      if (m[2] === "h") return val * 60;
      return val * 1440;
    };
    return parseTime(a.time) - parseTime(b.time);
  });

  return { projects, calendar, metrics, slackHighlights, feed };
}

export function buildSystemPrompt(ctx: Context): string {
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

  const calendar = ctx.calendar
    .map(
      (m) =>
        `- ${m.time} (${m.duration}) — ${m.title} [${m.attendees.join(", ")}]`,
    )
    .join("\n");

  const analytics = Object.entries(ctx.usage_analytics)
    .map(([key, v]) => {
      const label = key.toUpperCase();
      const unit = "unit" in v ? v.unit : "";
      return `- ${label}: ${v.value}${unit} (${v.change} over ${v.period})`;
    })
    .join("\n");

  const slack = ctx.slack_highlights
    .map((s) => `- ${s.channel} (${s.time}): ${s.message}`)
    .join("\n");

  const competitors = ctx.competitor_updates
    .map((c) => `- ${c.competitor} (${c.time}, via ${c.source}): ${c.event}`)
    .join("\n");

  const todos = ctx.todos
    .map((t) => `- [${t.done ? "x" : " "}] ${t.text}`)
    .join("\n");

  return `You are Mio, an AI work companion embedded in a founder's cockpit. The user is ${ctx.user}. They see a sidebar with their calendar, projects, analytics, Slack, competitor updates, and todo. You have persistent context about their work across all tools.

Here is what you know:

## Current Projects
${projects}

## Today's Calendar
${calendar}

## Key Metrics
${analytics}

## Recent Slack Activity
${slack}

## Competitor Intel
${competitors}

## Todo List
${todos}

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
