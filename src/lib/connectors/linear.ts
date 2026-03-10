import type { Connector, ConnectorData, ProjectData, FeedItem } from "./types";
import { getConnectorConfig } from "@/lib/config";

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  state: { name: string };
  priority: number;
  assignee: { name: string } | null;
  project: { name: string } | null;
  createdAt: string;
  updatedAt: string;
};

type LinearProject = {
  id: string;
  name: string;
  state: string;
  progress: number;
  issues: { nodes: LinearIssue[] };
};

type LinearTeam = {
  id: string;
  name: string;
  key: string;
};

const PRIORITY_MAP: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

async function linearGql(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export class LinearConnector implements Connector {
  id = "linear" as const;
  name = "Linear";

  isConfigured(): boolean {
    return !!getConnectorConfig("linear");
  }

  async fetchContext(): Promise<ConnectorData> {
    const config = getConnectorConfig("linear");
    if (!config) return {};

    const data = await linearGql(
      config.apiKey,
      `query {
        viewer {
          name
          assignedIssues(
            first: 50
            filter: { state: { type: { nin: ["canceled", "completed"] } } }
            orderBy: updatedAt
          ) {
            nodes {
              id identifier title
              state { name }
              priority
              assignee { name }
              project { name }
              createdAt updatedAt
            }
          }
        }
        teams(first: 10) {
          nodes {
            id name key
          }
        }
        projects(
          first: 10
          filter: { state: { eq: "started" } }
        ) {
          nodes {
            id name state progress
            issues(first: 20, orderBy: updatedAt) {
              nodes {
                id identifier title
                state { name }
                priority
                assignee { name }
                createdAt updatedAt
              }
            }
          }
        }
        cycles(
          first: 1
          filter: { isActive: { eq: true } }
        ) {
          nodes {
            id name number progress
          }
        }
      }`,
    );

    const projects: ProjectData[] = [];
    const feed: FeedItem[] = [];

    for (const proj of data.projects?.nodes || []) {
      const issues = proj.issues?.nodes || [];
      const completed = issues.filter(
        (i: LinearIssue) => i.state.name === "Done",
      ).length;
      const inProgress = issues.filter(
        (i: LinearIssue) => i.state.name === "In Progress",
      ).length;
      const backlog = issues.length - completed - inProgress;

      const activeCycle = data.cycles?.nodes?.[0];

      projects.push({
        name: proj.name,
        category: "Product",
        status: proj.state === "started" ? "Active" : proj.state,
        recent_activity: issues.slice(0, 5).map((i: LinearIssue) => ({
          date: new Date(i.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          event: `${i.identifier}: ${i.title} → ${i.state.name}`,
          source: "Linear",
        })),
        key_decisions: [],
        tools: ["Linear"],
        github: null,
        linear: {
          project: proj.name,
          total_issues: issues.length,
          completed,
          in_progress: inProgress,
          backlog,
          current_cycle: activeCycle
            ? `${activeCycle.name || `Cycle ${activeCycle.number}`}`
            : null,
          cycle_progress: activeCycle?.progress ?? null,
          recent_issues: issues.slice(0, 10).map((i: LinearIssue) => ({
            id: i.identifier,
            title: i.title,
            assignee: i.assignee?.name || "Unassigned",
            state: i.state.name,
            priority: PRIORITY_MAP[i.priority] || "Normal",
          })),
        },
        slack: null,
        meetings: [],
        people: [],
      });

      // Add recent issue updates to feed
      for (const issue of issues.slice(0, 3)) {
        feed.push({
          type: "code",
          actor: issue.assignee?.name || "Unknown",
          event: `${issue.identifier}: ${issue.title} → ${issue.state.name}`,
          project: proj.name,
          time: timeAgo(issue.updatedAt),
          icon: issue.state.name === "Done" ? "✅" : "📋",
        });
      }
    }

    return { projects, feed };
  }
}
