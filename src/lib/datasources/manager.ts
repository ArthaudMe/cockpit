import type { ServiceId, DatasourceStatus, DatasourceData } from "./types";
import { getConnectedServices } from "./token-store";
import { isGranolaAvailable, fetchGranolaMeetings } from "./connectors/granola";
import { fetchCalendarEvents, fetchRecentEmails } from "./connectors/google";
import { fetchLinearIssues } from "./connectors/linear";
import { fetchGitHubPRs, fetchGitHubNotifications } from "./connectors/github";
import { fetchNotionPages } from "./connectors/notion";
import { fetchSlackMessages } from "./connectors/slack";
import {
  getGoogleAuthUrl,
  exchangeGoogleCode,
} from "./connectors/google";
import {
  getLinearAuthUrl,
  exchangeLinearCode,
} from "./connectors/linear";
import {
  getGitHubAuthUrl,
  exchangeGitHubCode,
} from "./connectors/github";
import {
  getNotionAuthUrl,
  exchangeNotionCode,
} from "./connectors/notion";
import {
  getSlackAuthUrl,
  exchangeSlackCode,
} from "./connectors/slack";

const SERVICE_META: Record<
  ServiceId,
  { name: string; icon: string; description: string; needsOAuth: boolean }
> = {
  google: {
    name: "Google",
    icon: "G",
    description: "Calendar events & Gmail",
    needsOAuth: true,
  },
  linear: {
    name: "Linear",
    icon: "L",
    description: "Issues & projects",
    needsOAuth: true,
  },
  github: {
    name: "GitHub",
    icon: "GH",
    description: "PRs & notifications",
    needsOAuth: true,
  },
  notion: {
    name: "Notion",
    icon: "N",
    description: "Pages & documents",
    needsOAuth: true,
  },
  slack: {
    name: "Slack",
    icon: "S",
    description: "Messages & channels",
    needsOAuth: true,
  },
  granola: {
    name: "Granola",
    icon: "GR",
    description: "Meeting notes",
    needsOAuth: false,
  },
};

export function getDatasourceStatuses(): DatasourceStatus[] {
  const connected = getConnectedServices();
  const granolaAvailable = isGranolaAvailable();

  return Object.entries(SERVICE_META).map(([id, meta]) => ({
    id: id as ServiceId,
    ...meta,
    connected:
      id === "granola" ? granolaAvailable : connected.includes(id as ServiceId),
  }));
}

export function getAuthUrl(
  service: ServiceId,
  redirectUri: string,
  state: string
): string {
  switch (service) {
    case "google":
      return getGoogleAuthUrl(redirectUri, state);
    case "linear":
      return getLinearAuthUrl(redirectUri, state);
    case "github":
      return getGitHubAuthUrl(redirectUri, state);
    case "notion":
      return getNotionAuthUrl(redirectUri, state);
    case "slack":
      return getSlackAuthUrl(redirectUri, state);
    default:
      throw new Error(`Service ${service} does not support OAuth`);
  }
}

export async function exchangeCode(
  service: ServiceId,
  code: string,
  redirectUri: string
) {
  switch (service) {
    case "google":
      return exchangeGoogleCode(code, redirectUri);
    case "linear":
      return exchangeLinearCode(code, redirectUri);
    case "github":
      return exchangeGitHubCode(code, redirectUri);
    case "notion":
      return exchangeNotionCode(code, redirectUri);
    case "slack":
      return exchangeSlackCode(code, redirectUri);
    default:
      throw new Error(`Service ${service} does not support OAuth`);
  }
}

export async function fetchAllData(): Promise<DatasourceData> {
  const connected = getConnectedServices();
  const granolaAvailable = isGranolaAvailable();

  // Fetch all connected services in parallel
  const [
    calendar,
    emails,
    linearIssues,
    githubPRs,
    githubNotifications,
    notionPages,
    slackMessages,
  ] = await Promise.all([
    connected.includes("google") ? fetchCalendarEvents() : [],
    connected.includes("google") ? fetchRecentEmails() : [],
    connected.includes("linear") ? fetchLinearIssues() : [],
    connected.includes("github") ? fetchGitHubPRs() : [],
    connected.includes("github") ? fetchGitHubNotifications() : [],
    connected.includes("notion") ? fetchNotionPages() : [],
    connected.includes("slack") ? fetchSlackMessages() : [],
  ]);

  const granolaMeetings = granolaAvailable ? fetchGranolaMeetings() : [];

  return {
    calendar,
    emails,
    linearIssues,
    githubPRs,
    githubNotifications,
    notionPages,
    slackMessages,
    granolaMeetings,
  };
}
