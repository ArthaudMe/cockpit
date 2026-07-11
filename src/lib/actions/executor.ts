import { getTokens } from "@/lib/datasources/token-store";
import { createCalendarEventAuto, createGmailDraftAuto, sendEmailViaComposio } from "@/lib/datasources/connectors/google";
import { isComposioEnabled } from "@/lib/datasources/composio";
import { isGoogleConnectedViaComposio } from "@/lib/datasources/token-store";
import { appendToNotionPage } from "@/lib/datasources/connectors/notion";
import { fetchJson, fetchOk, HttpError } from "@/lib/datasources/http";
import type { ActionBlock, ActionResult } from "./types";
import { isValidActionType as isKnownActionType, validateActionParams } from "./schema";

// A Notion page/block id is a UUID (32 hex chars, optionally hyphenated). Reject
// anything else before interpolating it into the API path (mirrors the GitHub
// owner/repo validation below).
const NOTION_ID_RE = /^[0-9a-fA-F-]{32,36}$/;

// Remove anything that looks like a bearer token or secret so a passed-through
// provider error can't leak credentials into the chat/log.
function stripSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(api[_-]?key|token|secret|password)\b(\s*[=:]\s*)\S+/gi, "$1$2[redacted]");
}

// Pull a short, human-readable message out of a thrown error. HttpError carries
// the provider's response body (JSON like {message}/{detail}/{errors:[...]}),
// which we prefer so the user/model can actually correct the request.
function extractProviderMessage(err: unknown): string {
  let detail = "";
  if (err instanceof HttpError) {
    if (err.body) {
      try {
        const parsed = JSON.parse(err.body);
        detail =
          parsed?.message ||
          parsed?.detail ||
          parsed?.error?.message ||
          (typeof parsed?.error === "string" ? parsed.error : "") ||
          "";
        if (Array.isArray(parsed?.errors) && parsed.errors.length) {
          detail =
            parsed.errors.map((e: any) => e?.message || e).filter(Boolean).join("; ") || detail;
        }
      } catch {
        detail = err.body;
      }
    }
    detail = detail || `HTTP ${err.status}`;
  } else if (err instanceof Error) {
    detail = err.message;
  }
  return stripSecrets(String(detail)).trim().slice(0, 200);
}

function failureMessage(fallback: string, err: unknown): string {
  const detail = extractProviderMessage(err);
  return detail ? `${fallback} (${detail})` : fallback;
}

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
    const data: any = await fetchJson(
      "https://api.linear.app/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({ query: mutation, variables: { input } }),
      },
      { service: "linear" },
    );

    // Linear returns HTTP 200 with a populated `errors` array on failure.
    if (data.errors?.length) {
      const detail = stripSecrets(
        data.errors.map((e: any) => e?.message).filter(Boolean).join("; "),
      ).slice(0, 200);
      return {
        success: false,
        message: detail
          ? `Linear returned an error: ${detail}`
          : "Linear returned an error. Please check the issue details and try again.",
      };
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
    return { success: false, message: failureMessage("Couldn't create the Linear issue.", err) };
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
    const res = await fetchOk(
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
      },
      { service: "github" },
    );

    const data = await res.json();
    return {
      success: true,
      message: `Comment posted on ${owner}/${repo}#${pull_number}`,
      url: data.html_url,
      data: { comment_id: data.id },
    };
  } catch (err) {
    return { success: false, message: failureMessage("Couldn't post the GitHub comment.", err) };
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
    const data: any = await fetchJson(
      "https://slack.com/api/chat.postMessage",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel, text }),
      },
      { service: "slack" },
    );

    // Slack returns HTTP 200 with { ok: false, error } on failure.
    if (!data.ok) {
      const detail = stripSecrets(String(data.error || "")).slice(0, 200);
      return {
        success: false,
        message: detail
          ? `Slack couldn't send the message: ${detail}`
          : "Slack couldn't send the message. Please check the channel name and try again.",
      };
    }

    return {
      success: true,
      message: `Message sent to ${channel}`,
      data: { ts: data.ts, channel: data.channel },
    };
  } catch (err) {
    return { success: false, message: failureMessage("Couldn't reach Slack.", err) };
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

  // Validate the pageId against a UUID-ish charset before it reaches the Notion
  // API path (prevents path injection from LLM-supplied params).
  const pageIdStr = String(pageId).trim();
  if (!NOTION_ID_RE.test(pageIdStr)) {
    return { success: false, message: "Invalid pageId format (expected a Notion UUID)." };
  }

  try {
    const result = await appendToNotionPage({
      pageId: pageIdStr,
      content: content as string,
    });

    return {
      success: result.success,
      message: result.message,
      url: result.url,
    };
  } catch (err) {
    return { success: false, message: failureMessage("Couldn't update the Notion page.", err) };
  }
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

export function isValidActionType(type: string): boolean {
  return isKnownActionType(type);
}

export async function executeAction(action: ActionBlock): Promise<ActionResult> {
  const validation = validateActionParams(action.cockpit_action, action.params);
  if (!validation.ok) {
    return { success: false, message: validation.message };
  }

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
