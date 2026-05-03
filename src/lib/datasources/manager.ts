import type { ServiceId, DatasourceStatus, DatasourceData } from "./types";
import { getConnectedServices, getTokens } from "./token-store";
import { isGranolaAvailable, fetchGranolaMeetings } from "./connectors/granola";
import { fetchCalendarEvents, fetchRecentEmails } from "./connectors/google";
import { fetchLinearIssues } from "./connectors/linear";
import { fetchGitHubPRs, fetchGitHubNotifications } from "./connectors/github";
import { fetchNotionPages, isNotionConnected } from "./connectors/notion";
import { fetchSlackMessages } from "./connectors/slack";
import { getMcpServers } from "./mcp-store";
import { fetchMcpResources } from "./connectors/mcp";
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

// Services that need write scopes for actions but may have been connected with read-only
const WRITE_SCOPE_REQUIREMENTS: Partial<Record<ServiceId, { required: string; reason: string }>> = {
  linear: { required: "write", reason: "Reconnect to enable creating issues" },
};

export function getDatasourceStatuses(): DatasourceStatus[] {
  const connected = getConnectedServices();
  const granolaAvailable = isGranolaAvailable();

  return Object.entries(SERVICE_META).map(([id, meta]) => {
    const serviceId = id as ServiceId;
    const isConnected =
      id === "granola"
        ? granolaAvailable
        : id === "notion"
          ? isNotionConnected()
          : connected.includes(serviceId);

    let needsScopeUpgrade = false;
    let scopeUpgradeReason: string | undefined;

    if (isConnected) {
      const req = WRITE_SCOPE_REQUIREMENTS[serviceId];
      if (req) {
        const tokens = getTokens(serviceId);
        if (tokens?.scope && !tokens.scope.includes(req.required)) {
          needsScopeUpgrade = true;
          scopeUpgradeReason = req.reason;
        }
      }
    }

    return {
      id: serviceId,
      ...meta,
      connected: isConnected,
      needsScopeUpgrade,
      scopeUpgradeReason,
    };
  });
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

// In-memory cache to avoid redundant API calls from concurrent consumers
let _cachedData: DatasourceData | null = null;
let _cacheTime = 0;
const DATA_CACHE_TTL = 30_000; // 30s — stale data is fine for background tick

export async function fetchAllData(): Promise<DatasourceData> {
  // Return cached data if fresh enough
  if (_cachedData && Date.now() - _cacheTime < DATA_CACHE_TTL) {
    return _cachedData;
  }

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
    isNotionConnected() ? fetchNotionPages() : [],
    connected.includes("slack") ? fetchSlackMessages() : [],
  ]);

  const granolaMeetings = granolaAvailable ? fetchGranolaMeetings() : [];

  // Fetch MCP resources from all enabled servers
  const mcpServers = getMcpServers().filter((s) => s.enabled);
  const mcpResults = await Promise.allSettled(
    mcpServers.map((s) => fetchMcpResources(s)),
  );
  const mcpResources = mcpResults
    .filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchMcpResources>>> =>
        r.status === "fulfilled",
    )
    .flatMap((r) => r.value);

  const result: DatasourceData = {
    calendar,
    emails,
    linearIssues,
    githubPRs,
    githubNotifications,
    notionPages,
    slackMessages,
    granolaMeetings,
    mcpResources: mcpResources.length > 0 ? mcpResources : undefined,
  };

  _cachedData = result;
  _cacheTime = Date.now();

  return result;
}
