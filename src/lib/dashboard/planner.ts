import type { DashboardMetricDefinition, DashboardSpec } from "./types";

const METRIC_LIBRARY: DashboardMetricDefinition[] = [
  {
    id: "active_users",
    title: "Active users",
    category: "product",
    description: "How many distinct users used the product in the last 7 days.",
    requiredServices: ["posthog"],
    setupSteps: [
      "Connect PostHog with a project ID and personal API key.",
      "Make sure product events include a stable user identifier.",
    ],
    valueKey: "active_users_7d",
  },
  {
    id: "product_activity",
    title: "Product activity",
    category: "product",
    description: "Recent product event volume across the last 24 hours and 7 days.",
    requiredServices: ["posthog"],
    setupSteps: [
      "Connect PostHog.",
      "Verify the events being captured represent meaningful product usage.",
    ],
    valueKey: "events_7d",
  },
  {
    id: "activation",
    title: "Activation",
    category: "growth",
    description: "The share of new users who reach the product's first meaningful outcome.",
    requiredServices: ["posthog"],
    setupSteps: [
      "Connect PostHog.",
      "Choose the activation event, such as first agent run, workspace created, or teammate invited.",
      "Instrument signup and activation events with the same user identifier.",
    ],
    needsDefinition: true,
    definitionPrompt: "Choose the event that means a new user is activated.",
  },
  {
    id: "retention",
    title: "Retention",
    category: "growth",
    description: "Whether users come back after their first meaningful use.",
    requiredServices: ["posthog"],
    setupSteps: [
      "Connect PostHog.",
      "Define the retained action and cohort window.",
      "Instrument signup, activation, and repeat-use events.",
    ],
    needsDefinition: true,
    definitionPrompt: "Define the retained action and the cohort window.",
  },
  {
    id: "revenue",
    title: "Revenue",
    category: "revenue",
    description: "MRR, ARR, expansion, contraction, and revenue trend.",
    requiredServices: ["stripe"],
    setupSteps: [
      "Connect a billing source such as Stripe once the connector exists.",
      "Map plans, subscriptions, trials, upgrades, downgrades, and cancellations.",
    ],
  },
  {
    id: "pipeline",
    title: "Pipeline",
    category: "sales",
    description: "Open sales pipeline, stage movement, and qualified opportunities.",
    requiredServices: ["attio"],
    setupSteps: [
      "Connect Attio through the MCP datasource.",
      "Expose companies, deals, stages, owner, amount, and close date as structured resources.",
      "Define what counts as qualified pipeline.",
    ],
    needsDefinition: true,
    definitionPrompt: "Define qualified pipeline and the stages that should count.",
  },
  {
    id: "execution_velocity",
    title: "Execution velocity",
    category: "execution",
    description: "Open execution load across Linear issues and GitHub PRs.",
    requiredServices: ["linear", "github"],
    setupSteps: [
      "Connect Linear for open issue state.",
      "Connect GitHub for open PR and review state.",
    ],
  },
  {
    id: "open_prs",
    title: "Open PRs",
    category: "execution",
    description: "Pull requests currently involving the team.",
    requiredServices: ["github"],
    setupSteps: ["Connect GitHub."],
  },
  {
    id: "customer_feedback",
    title: "Customer feedback",
    category: "customer",
    description: "Recent customer signals from email, Slack, and docs.",
    requiredServices: ["google", "slack", "notion"],
    setupSteps: [
      "Connect Google, Slack, and Notion.",
      "Route support, sales, and customer-success signals into searchable channels or docs.",
    ],
  },
  {
    id: "meeting_load",
    title: "Meeting load",
    category: "team",
    description: "Upcoming calendar load and time pressure.",
    requiredServices: ["google"],
    setupSteps: ["Connect Google Calendar."],
  },
];

const DEFAULT_METRICS = [
  "active_users",
  "activation",
  "retention",
  "revenue",
  "pipeline",
  "execution_velocity",
];

const KEYWORDS: Record<string, string[]> = {
  active_users: ["active user", "wau", "mau", "usage", "users", "product usage"],
  product_activity: ["event", "activity", "feature usage", "product activity", "engagement"],
  activation: ["activation", "activate", "onboarding", "aha", "first value"],
  retention: ["retention", "retain", "churn", "returning", "cohort"],
  revenue: ["revenue", "mrr", "arr", "billing", "stripe", "cash", "expansion", "contraction"],
  pipeline: ["pipeline", "sales", "crm", "deal", "attio", "lead", "opportunity"],
  execution_velocity: ["velocity", "execution", "shipping", "linear", "project", "priority", "roadmap"],
  open_prs: ["pull request", "prs", "reviews", "github", "code"],
  customer_feedback: ["feedback", "customer", "nps", "support", "complaint", "request"],
  meeting_load: ["meeting", "calendar", "time", "schedule"],
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dashboard-${Date.now().toString(36)}`;
}

function titleForPrompt(prompt: string): string {
  const normalized = prompt.trim();
  if (!normalized) return "Company Dashboard";
  if (
    normalized.includes(",") ||
    /\band\b/i.test(normalized) ||
    /^(track|show|monitor|measure|i want|i'd like|i would like)\b/i.test(normalized)
  ) {
    return "Company Dashboard";
  }
  if (/\b(company|business|startup|cockpit|dashboard|results)\b/i.test(normalized)) {
    return "Company Dashboard";
  }
  const firstClause = normalized.split(/[.,\n]/)[0]?.trim();
  if (!firstClause) return "Company Dashboard";
  return firstClause.length > 42 ? `${firstClause.slice(0, 39)}...` : firstClause;
}

function selectMetricIds(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const selected = new Set<string>();

  for (const [id, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      selected.add(id);
    }
  }

  if (
    selected.size === 0 ||
    /\b(company|business|dashboard|results|health|kpi|metrics|how.*doing)\b/i.test(prompt)
  ) {
    for (const id of DEFAULT_METRICS) selected.add(id);
  }

  return METRIC_LIBRARY
    .map((metric) => metric.id)
    .filter((id) => selected.has(id));
}

export function buildDashboardDraft(prompt: string): DashboardSpec {
  const now = new Date().toISOString();
  const normalizedPrompt = prompt.trim() || "Show me how the company is doing.";
  const selectedIds = selectMetricIds(normalizedPrompt);
  const metrics = METRIC_LIBRARY.filter((metric) => selectedIds.includes(metric.id));

  return {
    id: makeId(),
    title: titleForPrompt(normalizedPrompt),
    prompt: normalizedPrompt,
    metrics,
    createdAt: now,
    updatedAt: now,
  };
}

export function metricLibrary(): DashboardMetricDefinition[] {
  return METRIC_LIBRARY;
}
