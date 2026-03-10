export type FilterRule = {
  field: string;
  operator: "equals" | "contains" | "in" | "gt" | "lt";
  value: string | string[] | number;
};

export type WebhookFilter = {
  source: string;
  rules: FilterRule[];
  priority: "low" | "normal" | "high" | "urgent";
  requiresLlm: boolean;
};

// Default filter rules — escalate only important events
const defaultFilters: WebhookFilter[] = [
  // Linear: urgent/high priority issues
  {
    source: "linear",
    rules: [
      { field: "data.priority", operator: "in", value: ["1", "2"] },
      { field: "type", operator: "contains", value: "Issue" },
    ],
    priority: "high",
    requiresLlm: false,
  },
  // Linear: state changes on assigned issues
  {
    source: "linear",
    rules: [
      { field: "type", operator: "equals", value: "Issue" },
      { field: "action", operator: "equals", value: "update" },
    ],
    priority: "normal",
    requiresLlm: false,
  },
  // GitHub: PR review requested
  {
    source: "github",
    rules: [
      { field: "action", operator: "equals", value: "review_requested" },
    ],
    priority: "high",
    requiresLlm: false,
  },
  // GitHub: CI failures
  {
    source: "github",
    rules: [
      { field: "action", operator: "equals", value: "completed" },
      { field: "check_run.conclusion", operator: "equals", value: "failure" },
    ],
    priority: "urgent",
    requiresLlm: false,
  },
  // Slack: direct mentions
  {
    source: "slack",
    rules: [
      { field: "event.type", operator: "equals", value: "app_mention" },
    ],
    priority: "high",
    requiresLlm: false,
  },
  // Slack: DMs
  {
    source: "slack",
    rules: [
      { field: "event.channel_type", operator: "equals", value: "im" },
    ],
    priority: "normal",
    requiresLlm: false,
  },
];

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateRule(payload: unknown, rule: FilterRule): boolean {
  const value = getNestedValue(payload, rule.field);
  if (value === undefined) return false;

  switch (rule.operator) {
    case "equals":
      return String(value) === String(rule.value);
    case "contains":
      return String(value)
        .toLowerCase()
        .includes(String(rule.value).toLowerCase());
    case "in":
      return Array.isArray(rule.value) && rule.value.includes(String(value));
    case "gt":
      return Number(value) > Number(rule.value);
    case "lt":
      return Number(value) < Number(rule.value);
    default:
      return false;
  }
}

export type FilterResult = {
  shouldAlert: boolean;
  priority: "low" | "normal" | "high" | "urgent";
  requiresLlm: boolean;
  matchedFilter: WebhookFilter | null;
};

export function evaluateWebhook(
  source: string,
  payload: unknown,
): FilterResult {
  const sourceFilters = defaultFilters.filter((f) => f.source === source);

  for (const filter of sourceFilters) {
    const allRulesMatch = filter.rules.every((rule) =>
      evaluateRule(payload, rule),
    );
    if (allRulesMatch) {
      return {
        shouldAlert: true,
        priority: filter.priority,
        requiresLlm: filter.requiresLlm,
        matchedFilter: filter,
      };
    }
  }

  // Default: create a low-priority alert without LLM
  return {
    shouldAlert: true,
    priority: "low",
    requiresLlm: false,
    matchedFilter: null,
  };
}
