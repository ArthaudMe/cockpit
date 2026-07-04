import type { DatasourceData, MetricValue } from "@/lib/datasources/types";
import type {
  DashboardMetricCard,
  DashboardMetricDefinition,
  DashboardRun,
  DashboardServiceId,
  DashboardSpec,
} from "./types";

const SERVICE_LABELS: Record<DashboardServiceId, string> = {
  google: "Google",
  linear: "Linear",
  github: "GitHub",
  notion: "Notion",
  slack: "Slack",
  granola: "Granola",
  posthog: "PostHog",
  attio: "Attio",
  stripe: "Stripe",
  mcp: "MCP",
};

export function dashboardServiceLabel(service: DashboardServiceId): string {
  return SERVICE_LABELS[service] || service;
}

function isConnected(data: DatasourceData, service: DashboardServiceId): boolean {
  if (service === "stripe") return false;
  if (service === "mcp") return Boolean(data.mcpResources?.length);
  if (service === "posthog") {
    return Boolean(data._connected?.posthog || Object.keys(data.posthogMetrics || {}).length > 0);
  }
  if (service === "google") {
    return Boolean(data._connected?.google || data.calendar?.length || data.emails?.length);
  }
  if (service === "attio") {
    return Boolean(data._connected?.attio);
  }
  return Boolean(data._connected?.[service]);
}

function formatMetric(metric?: MetricValue): { value?: string; change?: string; period?: string } {
  if (!metric) return {};
  const suffix = metric.unit || "";
  return {
    value: `${metric.value.toLocaleString()}${suffix}`,
    change: metric.change,
    period: metric.period,
  };
}

function metricValue(
  definition: DashboardMetricDefinition,
  data: DatasourceData,
): Pick<DashboardMetricCard, "value" | "change" | "period" | "detail"> | null {
  switch (definition.id) {
    case "active_users": {
      const value = formatMetric(data.posthogMetrics?.active_users_7d);
      if (!value.value) return null;
      return {
        ...value,
        detail: "Distinct users with product activity in the last 7 days.",
      };
    }
    case "product_activity": {
      const sevenDay = data.posthogMetrics?.events_7d;
      const day = data.posthogMetrics?.events_24h;
      const value = formatMetric(sevenDay);
      if (!value.value) return null;
      return {
        ...value,
        detail: `${day?.value.toLocaleString() || 0} events in the last 24 hours.`,
      };
    }
    case "execution_velocity": {
      const issues = data.linearIssues?.length || 0;
      const prs = data.githubPRs?.length || 0;
      return {
        value: String(issues + prs),
        change: "live",
        period: "now",
        detail: `${issues} open Linear issues and ${prs} open GitHub PRs in the current snapshot.`,
      };
    }
    case "open_prs": {
      const prs = data.githubPRs?.length || 0;
      return {
        value: String(prs),
        change: "live",
        period: "now",
        detail: "Open pull requests involving the connected GitHub account.",
      };
    }
    case "customer_feedback": {
      const emails = data.emails?.length || 0;
      const slack = data.slackMessages?.length || 0;
      const notion = data.notionPages?.length || 0;
      return {
        value: String(emails + slack + notion),
        change: "live",
        period: "recent",
        detail: `${emails} emails, ${slack} Slack messages, and ${notion} recent Notion pages available for review.`,
      };
    }
    case "meeting_load": {
      const meetings = data.calendar?.length || 0;
      return {
        value: String(meetings),
        change: "live",
        period: "7d",
        detail: "Upcoming meetings from the connected calendar.",
      };
    }
    default:
      return null;
  }
}

function stateFor(
  definition: DashboardMetricDefinition,
  data: DatasourceData,
): Pick<DashboardMetricCard, "state" | "missingServices" | "detail" | "value" | "change" | "period"> {
  if (definition.requiredServices.includes("stripe")) {
    return {
      state: "unsupported",
      missingServices: ["stripe"],
      detail: "Cockpit does not have a Stripe or billing connector yet. This card is a data requirement, not a computed metric.",
    };
  }

  const missingServices = definition.requiredServices.filter((service) => !isConnected(data, service));
  if (missingServices.length > 0) {
    return {
      state: "needs_connection",
      missingServices,
      detail: `Connect ${missingServices.map(dashboardServiceLabel).join(", ")} to compute this metric.`,
    };
  }

  if (definition.needsDefinition) {
    return {
      state: "needs_definition",
      missingServices: [],
      detail: definition.definitionPrompt || "This metric needs a company-specific definition before it can be computed.",
    };
  }

  const computed = metricValue(definition, data);
  if (!computed) {
    return {
      state: "no_data",
      missingServices: [],
      detail: "The required source is connected, but the current snapshot does not contain this metric yet.",
    };
  }

  return {
    state: "available",
    missingServices: [],
    ...computed,
  };
}

export function runDashboard(spec: DashboardSpec, data: DatasourceData): DashboardRun {
  const cards = spec.metrics.map((definition): DashboardMetricCard => ({
    ...definition,
    ...stateFor(definition, data),
  }));

  return {
    cards,
    summary: {
      available: cards.filter((card) => card.state === "available").length,
      needsConnection: cards.filter((card) => card.state === "needs_connection").length,
      needsDefinition: cards.filter((card) => card.state === "needs_definition").length,
      unsupported: cards.filter((card) => card.state === "unsupported").length,
      noData: cards.filter((card) => card.state === "no_data").length,
    },
  };
}

export function buildDashboardFocusContext(spec: DashboardSpec, run: DashboardRun): string {
  const cards = run.cards.map((card) => {
    const missing = card.missingServices.length
      ? ` Missing services: ${card.missingServices.map(dashboardServiceLabel).join(", ")}.`
      : "";
    const value = card.value ? ` Value: ${card.value}${card.change ? ` (${card.change} / ${card.period})` : ""}.` : "";
    return `- ${card.title} [${card.state}].${value} ${card.detail}.${missing}`;
  });

  return [
    `Dashboard: ${spec.title}`,
    `Original founder request: ${spec.prompt}`,
    `Readiness: ${run.summary.available} available, ${run.summary.needsConnection} need connection, ${run.summary.needsDefinition} need definition, ${run.summary.unsupported} unsupported, ${run.summary.noData} connected but no data.`,
    "Metric cards:",
    ...cards,
    "When answering, distinguish computed values from setup requirements. Do not invent missing metrics. If data is missing, say exactly what connection, event, or definition is needed.",
  ].join("\n");
}
