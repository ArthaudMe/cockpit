import { getTokens } from "@/lib/datasources/token-store";
import type { ActionBlock, ActionResult } from "./types";

async function executeLinearCreateIssue(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const tokens = getTokens("linear");
  if (!tokens) {
    return { success: false, message: "Linear not connected. Please connect Linear in Settings." };
  }

  const { title, description, teamId, priority } = params;
  if (!title || !teamId) {
    return { success: false, message: "Missing required params: title, teamId" };
  }

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          identifier
          title
          url
        }
      }
    }
  `;

  const input: Record<string, unknown> = {
    title,
    teamId,
  };
  if (description) input.description = description;
  if (priority != null) input.priority = priority;

  try {
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({ query: mutation, variables: { input } }),
    });

    if (!res.ok) {
      return { success: false, message: `Linear API error: ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    if (data.errors?.length) {
      return { success: false, message: `Linear error: ${data.errors[0].message}` };
    }

    const issue = data.data?.issueCreate?.issue;
    if (!data.data?.issueCreate?.success || !issue) {
      return { success: false, message: "Linear issue creation failed" };
    }

    return {
      success: true,
      message: `Created issue ${issue.identifier}: ${issue.title}`,
      url: issue.url,
      data: { identifier: issue.identifier },
    };
  } catch (err) {
    return { success: false, message: `Linear request failed: ${(err as Error).message}` };
  }
}

async function executeGitHubCommentPR(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const tokens = getTokens("github");
  if (!tokens) {
    return { success: false, message: "GitHub not connected. Please connect GitHub in Settings." };
  }

  const { owner, repo, pull_number, body } = params;
  if (!owner || !repo || !pull_number || !body) {
    return { success: false, message: "Missing required params: owner, repo, pull_number, body" };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${pull_number}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: `GitHub API error: ${res.status} ${(errData as any).message || res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      message: `Comment posted on ${owner}/${repo}#${pull_number}`,
      url: data.html_url,
      data: { comment_id: data.id },
    };
  } catch (err) {
    return { success: false, message: `GitHub request failed: ${(err as Error).message}` };
  }
}

async function executeSlackSendMessage(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const tokens = getTokens("slack");
  if (!tokens) {
    return { success: false, message: "Slack not connected. Please connect Slack in Settings." };
  }

  const { channel, text } = params;
  if (!channel || !text) {
    return { success: false, message: "Missing required params: channel, text" };
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { success: false, message: `Slack error: ${data.error}` };
    }

    return {
      success: true,
      message: `Message sent to ${channel}`,
      data: { ts: data.ts, channel: data.channel },
    };
  } catch (err) {
    return { success: false, message: `Slack request failed: ${(err as Error).message}` };
  }
}

const SUPPORTED_ACTIONS = new Set([
  "linear_create_issue",
  "github_comment_pr",
  "slack_send_message",
  "calendar_create_event",
  "gmail_draft",
  "notion_update_page",
]);

export function isValidActionType(type: string): boolean {
  return SUPPORTED_ACTIONS.has(type);
}

export async function executeAction(action: ActionBlock): Promise<ActionResult> {
  switch (action.cockpit_action) {
    case "linear_create_issue":
      return executeLinearCreateIssue(action.params);
    case "github_comment_pr":
      return executeGitHubCommentPR(action.params);
    case "slack_send_message":
      return executeSlackSendMessage(action.params);
    case "calendar_create_event":
      return { success: false, message: "Calendar event creation is not yet implemented" };
    case "gmail_draft":
      return { success: false, message: "Gmail draft creation is not yet implemented" };
    case "notion_update_page":
      return { success: false, message: "Notion page update is not yet implemented" };
    default:
      return { success: false, message: `Unknown action type: ${action.cockpit_action}` };
  }
}
