import type { ActionType } from "./types";

type ParamType = "string" | "number" | "string[]";

type ActionParamSpec = {
  type: ParamType;
  required?: boolean;
  description?: string;
};

type ActionSchema = {
  description: string;
  params: Record<string, ActionParamSpec>;
  exposedInPrompt?: boolean;
};

export const ACTION_SCHEMAS: Record<ActionType, ActionSchema> = {
  linear_create_issue: {
    description: "Create a Linear issue",
    params: {
      title: { type: "string", required: true },
      description: { type: "string" },
      teamId: { type: "string", required: true },
      priority: { type: "number", description: "0=None, 1=Urgent, 2=High, 3=Normal, 4=Low" },
    },
  },
  github_comment_pr: {
    description: "Comment on a GitHub pull request",
    params: {
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
      pull_number: { type: "number", required: true },
      body: { type: "string", required: true },
    },
  },
  slack_send_message: {
    description: "Send a Slack message",
    params: {
      channel: { type: "string", required: true, description: "channel name or ID" },
      text: { type: "string", required: true },
    },
  },
  calendar_create_event: {
    description: "Create a Google Calendar event",
    params: {
      summary: { type: "string", required: true },
      start: { type: "string", required: true, description: "ISO datetime" },
      end: { type: "string", required: true, description: "ISO datetime" },
      description: { type: "string" },
      attendees: { type: "string[]", description: "array of emails" },
    },
  },
  gmail_draft: {
    description: "Create a Gmail draft",
    params: {
      to: { type: "string", required: true, description: "email" },
      subject: { type: "string", required: true },
      body: { type: "string", required: true },
    },
  },
  gmail_send: {
    description: "Send a Gmail message directly when Composio is enabled",
    exposedInPrompt: false,
    params: {
      to: { type: "string", required: true, description: "email" },
      subject: { type: "string", required: true },
      body: { type: "string", required: true },
    },
  },
  notion_update_page: {
    description: "Append content to a Notion page",
    params: {
      pageId: { type: "string", required: true },
      content: { type: "string", required: true, description: "text with newlines for paragraphs" },
    },
  },
};

export function isValidActionType(type: string): type is ActionType {
  return Object.prototype.hasOwnProperty.call(ACTION_SCHEMAS, type);
}

function isParamOfType(value: unknown, type: ParamType): boolean {
  if (type === "string") return typeof value === "string" && value.trim().length > 0;
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function validateActionParams(
  action: ActionType,
  params: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const schema = ACTION_SCHEMAS[action];
  if (!schema) {
    return { ok: false, message: `Unknown action type: ${action}` };
  }

  for (const [name, spec] of Object.entries(schema.params)) {
    const value = params[name];
    if (value == null || value === "") {
      if (spec.required) {
        return { ok: false, message: `Missing required param: ${name}` };
      }
      continue;
    }

    if (!isParamOfType(value, spec.type)) {
      return { ok: false, message: `Invalid param ${name}: expected ${spec.type}` };
    }
  }

  return { ok: true };
}

export function buildActionPromptSection(): string {
  return Object.entries(ACTION_SCHEMAS)
    .filter(([, schema]) => schema.exposedInPrompt !== false)
    .map(([action, schema]) => {
      const params = Object.entries(schema.params)
        .map(([name, spec]) => {
          const required = spec.required ? " (required)" : "";
          const description = spec.description ? `, ${spec.description}` : "";
          return `${name}${required}: ${spec.type}${description}`;
        })
        .join("; ");
      return `- **${action}** — ${schema.description}. Params: ${params}`;
    })
    .join("\n");
}
