import type { ServiceId } from "@/lib/datasources/types";

export type DashboardServiceId = ServiceId | "stripe" | "mcp";

export type DashboardMetricState =
  | "available"
  | "needs_connection"
  | "needs_definition"
  | "unsupported"
  | "no_data";

export type DashboardMetricDefinition = {
  id: string;
  title: string;
  category: "growth" | "revenue" | "sales" | "product" | "execution" | "customer" | "team";
  description: string;
  requiredServices: DashboardServiceId[];
  setupSteps: string[];
  needsDefinition?: boolean;
  definitionPrompt?: string;
  valueKey?: string;
};

export type DashboardSpec = {
  id: string;
  title: string;
  prompt: string;
  metrics: DashboardMetricDefinition[];
  createdAt: string;
  updatedAt: string;
};

export type DashboardMetricCard = DashboardMetricDefinition & {
  state: DashboardMetricState;
  value?: string;
  change?: string;
  period?: string;
  detail: string;
  missingServices: DashboardServiceId[];
};

export type DashboardRun = {
  cards: DashboardMetricCard[];
  summary: {
    available: number;
    needsConnection: number;
    needsDefinition: number;
    unsupported: number;
    noData: number;
  };
};
