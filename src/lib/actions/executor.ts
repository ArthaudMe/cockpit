import { getTokens } from "@/lib/datasources/token-store";
import { createCalendarEventAuto, createGmailDraftAuto, sendEmailViaComposio } from "@/lib/datasources/connectors/google";
import { isComposioEnabled } from "@/lib/datasources/composio";
import { isGoogleConnectedViaComposio } from "@/lib/datasources/token-store";
import { appendToNotionPage } from "@/lib/datasources/connectors/notion";
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
      return { success: false, message: "Couldn't create the Linear issue. Please check your connection and try again." };
    }

    const data = await res.json();
    if (data.errors?.length) {
      return { success: false, message: "Linear returned an error. Please check the issue details and try again." };
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
    return { success: false, message: "Couldn't reach Linear. Please check your internet connection." };
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

  // Validate path segments to prevent URL injection
  const ownerStr = String(owner);
  const repoStr = String(repo);
  const prNum = Number(pull_number);
  if (!/^[\w.-]+$/.test(ownerStr) || !/^[\w.-]+$/.test(repoStr) || !Number.isInteger(prNum) || prNum < 1) {
    return { success: false, message: "Invalid owner, repo, or pull_number format" };
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(ownerStr)}/${encodeURIComponent(repoStr)}/issues/${prNum}/comments`,
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
        message: "Couldn't post the GitHub comment. Please check your permissions and try again.",
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
    return { success: false, message: "Couldn't reach GitHub. Please check your internet connection." };
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
      return { success: false, message: "Slack couldn't send the message. Please check the channel name and try again." };
    }

    return {
      success: true,
      message: `Message sent to ${channel}`,
      data: { ts: data.ts, channel: data.channel },
    };
  } catch (err) {
    return { success: false, message: "Couldn't reach Slack. Please check your internet connection." };
  }
}

async function executeCalendarCreateEvent(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const { summary, start, end, description, attendees } = params;
  if (!summary || !start || !end) {
    return { success: false, message: "Missing required params: summary, start, end (ISO datetime)" };
  }

  const result = await createCalendarEventAuto({
    summary: summary as string,
    start: start as string,
    end: end as string,
    description: description as string | undefined,
    attendees: attendees as string[] | undefined,
  });

  return {
    success: result.success,
    message: result.message,
    url: result.url,
  };
}

async function executeGmailDraft(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const { to, subject, body } = params;
  if (!to || !subject || !body) {
    return { success: false, message: "Missing required params: to, subject, body" };
  }

  const result = await createGmailDraftAuto({
    to: to as string,
    subject: subject as string,
    body: body as string,
  });

  return {
    success: result.success,
    message: result.message,
    url: result.url,
  };
}

async function executeNotionUpdatePage(
  params: Record<string, unknown>
): Promise<ActionResult> {
  const { pageId, content } = params;
  if (!pageId || !content) {
    return { success: false, message: "Missing required params: pageId, content" };
  }

  const result = await appendToNotionPage({
    pageId: pageId as string,
    content: content as string,
  });

  return {
    success: result.success,
    message: result.message,
    url: result.url,
  };
}

async function executeGmailSend(
  params: Record<string, unknown>
): Promise<ActionResult> {
  if (!isComposioEnabled() || !isGoogleConnectedViaComposio()) {
    return { success: false, message: "Direct email sending requires Composio. Use gmail_draft instead." };
  }

  const { to, subject, body } = params;
  if (!to || !subject || !body) {
    return { success: false, message: "Missing required params: to, subject, body" };
  }

  return sendEmailViaComposio({
    to: to as string,
    subject: subject as string,
    body: body as string,
  });
}

const SUPPORTED_ACTIONS = new Set([
  "linear_create_issue",
  "github_comment_pr",
  "slack_send_message",
  "calendar_create_event",
  "gmail_draft",
  "gmail_send",
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
      return executeCalendarCreateEvent(action.params);
    case "gmail_draft":
      return executeGmailDraft(action.params);
    case "gmail_send":
      return executeGmailSend(action.params);
    case "notion_update_page":
      return executeNotionUpdatePage(action.params);
    default:
      return { success: false, message: `Unknown action type: ${action.cockpit_action}` };
  }
}
