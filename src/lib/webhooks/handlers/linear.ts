import type { WebhookResult } from "../router";

type LinearWebhookPayload = {
  action: string;
  type: string;
  data: {
    id: string;
    identifier?: string;
    title?: string;
    priority?: number;
    state?: { name: string };
    assignee?: { name: string };
    project?: { name: string };
    description?: string;
  };
  updatedFrom?: Record<string, unknown>;
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

export function handleLinearWebhook(
  payload: unknown,
): WebhookResult | null {
  const data = payload as LinearWebhookPayload;

  if (!data.type || !data.action || !data.data) {
    return null;
  }

  const issueId = data.data.identifier || data.data.id;
  const title = data.data.title || "Untitled";
  const priority = data.data.priority
    ? PRIORITY_LABELS[data.data.priority] || ""
    : "";
  const assignee = data.data.assignee?.name || "Unassigned";
  const state = data.data.state?.name || "";
  const project = data.data.project?.name || "";

  if (data.type === "Issue") {
    if (data.action === "create") {
      return {
        title: `New issue: ${issueId} — ${title}`,
        body: [
          priority && `Priority: ${priority}`,
          `Assignee: ${assignee}`,
          project && `Project: ${project}`,
        ]
          .filter(Boolean)
          .join(" · "),
        source: "Linear",
      };
    }

    if (data.action === "update") {
      const changes: string[] = [];
      if (data.updatedFrom) {
        if ("stateId" in data.updatedFrom) {
          changes.push(`State → ${state}`);
        }
        if ("priority" in data.updatedFrom) {
          changes.push(`Priority → ${priority}`);
        }
        if ("assigneeId" in data.updatedFrom) {
          changes.push(`Assigned to ${assignee}`);
        }
      }

      return {
        title: `${issueId}: ${title}`,
        body: changes.length
          ? changes.join(", ")
          : `Updated (${state}, ${assignee})`,
        source: "Linear",
      };
    }
  }

  if (data.type === "Comment" && data.action === "create") {
    return {
      title: `New comment on ${issueId}: ${title}`,
      body: data.data.description?.slice(0, 200),
      source: "Linear",
    };
  }

  return {
    title: `${data.type} ${data.action}: ${title || issueId}`,
    source: "Linear",
  };
}
