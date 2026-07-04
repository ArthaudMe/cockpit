import fs from "fs";
import path from "path";
import os from "os";
import type { DashboardMetricDefinition, DashboardServiceId, DashboardSpec } from "./types";

const STORE_DIR = path.join(os.homedir(), ".cockpit");
const STORE_PATH = path.join(STORE_DIR, "dashboards.json");

type DashboardStore = {
  dashboards: DashboardSpec[];
  activeDashboardId?: string;
};

const VALID_SERVICES = new Set<DashboardServiceId>([
  "google",
  "linear",
  "github",
  "notion",
  "slack",
  "granola",
  "posthog",
  "attio",
  "stripe",
  "mcp",
]);

const VALID_CATEGORIES = new Set<DashboardMetricDefinition["category"]>([
  "growth",
  "revenue",
  "sales",
  "product",
  "execution",
  "customer",
  "team",
]);

function ensureDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function read(): DashboardStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return { dashboards: [] };
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      dashboards: Array.isArray(parsed.dashboards) ? parsed.dashboards : [],
      activeDashboardId: typeof parsed.activeDashboardId === "string" ? parsed.activeDashboardId : undefined,
    };
  } catch {
    return { dashboards: [] };
  }
}

function write(store: DashboardStore) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.slice(0, 500) : fallback;
}

function normalizeMetric(value: unknown): DashboardMetricDefinition | null {
  if (!value || typeof value !== "object") return null;
  const metric = value as Record<string, unknown>;
  const id = stringValue(metric.id).trim();
  const title = stringValue(metric.title).trim();
  const category = stringValue(metric.category) as DashboardMetricDefinition["category"];
  if (!id || !title || !VALID_CATEGORIES.has(category)) return null;

  const requiredServices = Array.isArray(metric.requiredServices)
    ? metric.requiredServices.filter((service): service is DashboardServiceId =>
        typeof service === "string" && VALID_SERVICES.has(service as DashboardServiceId),
      )
    : [];

  const setupSteps = Array.isArray(metric.setupSteps)
    ? metric.setupSteps.filter((step): step is string => typeof step === "string").map((step) => step.slice(0, 300))
    : [];

  return {
    id,
    title,
    category,
    description: stringValue(metric.description),
    requiredServices,
    setupSteps,
    needsDefinition: metric.needsDefinition === true,
    definitionPrompt: typeof metric.definitionPrompt === "string" ? metric.definitionPrompt.slice(0, 300) : undefined,
    valueKey: typeof metric.valueKey === "string" ? metric.valueKey.slice(0, 80) : undefined,
  };
}

function normalizeDashboard(value: unknown): DashboardSpec {
  if (!value || typeof value !== "object") {
    throw new Error("Dashboard payload is required.");
  }
  const dashboard = value as Record<string, unknown>;
  const id = stringValue(dashboard.id).trim() || crypto.randomUUID();
  const title = stringValue(dashboard.title, "Company Dashboard").trim() || "Company Dashboard";
  const prompt = stringValue(dashboard.prompt, "Show me how the company is doing.").trim();
  const metrics = Array.isArray(dashboard.metrics)
    ? dashboard.metrics.map(normalizeMetric).filter((metric): metric is DashboardMetricDefinition => Boolean(metric))
    : [];

  if (metrics.length === 0) throw new Error("Dashboard must contain at least one metric.");

  const now = new Date().toISOString();
  return {
    id,
    title: title.slice(0, 80),
    prompt: prompt.slice(0, 1000),
    metrics: metrics.slice(0, 24),
    createdAt: stringValue(dashboard.createdAt, now) || now,
    updatedAt: now,
  };
}

export function getDashboardStore(): DashboardStore {
  return read();
}

export function getActiveDashboard(): DashboardSpec | null {
  const store = read();
  return store.dashboards.find((dashboard) => dashboard.id === store.activeDashboardId) || store.dashboards[0] || null;
}

export function saveDashboard(input: unknown): DashboardSpec {
  const dashboard = normalizeDashboard(input);
  const store = read();
  const index = store.dashboards.findIndex((item) => item.id === dashboard.id);
  const nextDashboards =
    index === -1
      ? [...store.dashboards, dashboard]
      : store.dashboards.map((item, i) =>
          i === index ? { ...dashboard, createdAt: item.createdAt || dashboard.createdAt } : item,
        );

  write({
    dashboards: nextDashboards,
    activeDashboardId: dashboard.id,
  });

  return dashboard;
}

export function clearDashboards() {
  write({ dashboards: [] });
}
