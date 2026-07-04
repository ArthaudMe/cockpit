import { describe, expect, it } from "vitest";
import { buildDashboardDraft } from "../dashboard/planner";
import { buildDashboardFocusContext, runDashboard } from "../dashboard/runner";

describe("dashboard planner and runner", () => {
  it("turns a founder request into metric definitions", () => {
    const dashboard = buildDashboardDraft("Track activation, revenue, and execution velocity");

    expect(dashboard.title).toBe("Company Dashboard");
    expect(dashboard.metrics.map((metric) => metric.id)).toEqual([
      "activation",
      "revenue",
      "execution_velocity",
    ]);
  });

  it("separates live metrics from setup requirements", () => {
    const dashboard = buildDashboardDraft("Track active users, activation, revenue, and execution velocity");
    const run = runDashboard(dashboard, {
      _connected: {
        posthog: true,
        linear: true,
        github: true,
      },
      posthogMetrics: {
        active_users_7d: { value: 42, change: "live", period: "7d" },
      },
      linearIssues: [
        {
          id: "APP-1",
          title: "Ship dashboard",
          state: "In Progress",
          priority: "High",
          assignee: "Art",
          updatedAt: "2026-07-04T10:00:00.000Z",
        },
      ],
      githubPRs: [
        {
          title: "Dashboard shell",
          repo: "mio/cockpit",
          author: "Art",
          status: "open",
          time: "2026-07-04T10:00:00.000Z",
          url: "https://github.com/mio/cockpit/pull/1",
        },
      ],
    });

    const byId = new Map(run.cards.map((card) => [card.id, card]));
    expect(byId.get("active_users")?.state).toBe("available");
    expect(byId.get("activation")?.state).toBe("needs_definition");
    expect(byId.get("revenue")?.state).toBe("unsupported");
    expect(byId.get("execution_velocity")?.value).toBe("2");
  });

  it("builds chat context that forbids invented missing data", () => {
    const dashboard = buildDashboardDraft("Track revenue");
    const run = runDashboard(dashboard, {});
    const context = buildDashboardFocusContext(dashboard, run);

    expect(context).toContain("Revenue [unsupported]");
    expect(context).toContain("Do not invent missing metrics");
  });
});
