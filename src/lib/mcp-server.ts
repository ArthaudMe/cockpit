import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchCalendarEvents,
  fetchRecentEmails,
} from "./datasources/connectors/google";
import { fetchLinearIssues } from "./datasources/connectors/linear";
import {
  fetchGitHubPRs,
  fetchGitHubNotifications,
} from "./datasources/connectors/github";
import { fetchSlackMessages } from "./datasources/connectors/slack";
import { fetchNotionPages } from "./datasources/connectors/notion";
import {
  fetchGranolaMeetings,
  isGranolaAvailable,
} from "./datasources/connectors/granola";
import { getDatasourceStatuses } from "./datasources/manager";

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "cockpit", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.registerTool("get_connection_status", {
    title: "Connection Status",
    description:
      "Check which datasources are currently connected and available",
    annotations: { readOnlyHint: true },
  }, async () => {
    const statuses = getDatasourceStatuses();
    return textResult(statuses);
  });

  server.registerTool("get_calendar_events", {
    title: "Calendar Events",
    description:
      "Fetch upcoming Google Calendar events for the next 7 days. Returns title, time, date, duration, attendees, and description.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const events = await fetchCalendarEvents();
    if (!events.length)
      return textResult({ message: "No events found or Google Calendar not connected" });
    return textResult(events);
  });

  server.registerTool("get_recent_emails", {
    title: "Recent Emails",
    description:
      "Fetch recent Gmail messages from the last 2 days. Returns subject, sender, snippet, time, and unread status.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const emails = await fetchRecentEmails();
    if (!emails.length)
      return textResult({ message: "No recent emails or Gmail not connected" });
    return textResult(emails);
  });

  server.registerTool("get_linear_issues", {
    title: "Linear Issues",
    description:
      "Fetch Linear issues assigned to the user. Excludes canceled and completed issues. Returns id, title, state, priority, assignee, project, and last updated time.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const issues = await fetchLinearIssues();
    if (!issues.length)
      return textResult({ message: "No issues found or Linear not connected" });
    return textResult(issues);
  });

  server.registerTool("get_github_prs", {
    title: "GitHub PRs",
    description:
      "Fetch open GitHub pull requests involving the user. Returns title, repo, author, status (draft/open), time, and URL.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const prs = await fetchGitHubPRs();
    if (!prs.length)
      return textResult({ message: "No open PRs or GitHub not connected" });
    return textResult(prs);
  });

  server.registerTool("get_github_notifications", {
    title: "GitHub Notifications",
    description:
      "Fetch unread GitHub notifications. Returns title, repo, type, time, and URL.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const notifs = await fetchGitHubNotifications();
    if (!notifs.length)
      return textResult({ message: "No notifications or GitHub not connected" });
    return textResult(notifs);
  });

  server.registerTool("get_slack_messages", {
    title: "Slack Messages",
    description:
      "Fetch recent Slack messages from joined channels (last 24 hours). Returns channel, message text, author, and time.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const messages = await fetchSlackMessages();
    if (!messages.length)
      return textResult({ message: "No recent messages or Slack not connected" });
    return textResult(messages);
  });

  server.registerTool("get_notion_pages", {
    title: "Notion Pages",
    description:
      "Fetch recently edited Notion pages. Returns title, last edited time, URL, and parent type.",
    annotations: { readOnlyHint: true },
  }, async () => {
    const pages = await fetchNotionPages();
    if (!pages.length)
      return textResult({ message: "No pages found or Notion not connected" });
    return textResult(pages);
  });

  server.registerTool("get_granola_meetings", {
    title: "Granola Meetings",
    description:
      "Fetch recent meeting notes from Granola (last 7 days). Returns title, time, attendees, notes, and summary. Only available on macOS with Granola installed.",
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!isGranolaAvailable())
      return textResult({ message: "Granola not available on this system" });
    const meetings = fetchGranolaMeetings();
    if (!meetings.length)
      return textResult({ message: "No recent meetings found" });
    return textResult(meetings);
  });

  return server;
}
