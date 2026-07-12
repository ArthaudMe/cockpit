import type { ServiceId, DatasourceStatus, DatasourceData } from "./types";
import { getConnectedServices, getTokens, isServiceDisabled, isGoogleConnectedViaComposio } from "./token-store";
import { fetchPostHogMetrics, isPostHogConfigured } from "./connectors/posthog";
import { fetchCalendarEventsAuto, fetchRecentEmailsAuto } from "./connectors/google";
import { fetchLinearIssues } from "./connectors/linear";
import { fetchGitHubPRs, fetchGitHubNotifications } from "./connectors/github";
import { fetchNotionPages, isNotionConnected } from "./connectors/notion";
import { fetchSlackMessages } from "./connectors/slack";
import { getMcpServerByPreset, getMcpServers, hasMcpOAuthTokens } from "./mcp-store";
import { fetchMcpResources } from "./connectors/mcp";
import { isComposioEnabled } from "./composio";
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
    description: "Meeting notes via MCP",
    needsOAuth: true,
  },
  posthog: {
    name: "PostHog",
    icon: "PH",
    description: "Product analytics and usage metrics",
    needsOAuth: false,
  },
  attio: {
    name: "Attio",
    icon: "AT",
    description: "CRM, companies, and pipeline via MCP",
    needsOAuth: true,
  },
};

// Services that need write scopes for actions but may have been connected with read-only
const WRITE_SCOPE_REQUIREMENTS: Partial<Record<ServiceId, { required: string; reason: string }>> = {
  linear: { required: "write", reason: "Reconnect to enable creating issues" },
};

export function getDatasourceStatuses(): DatasourceStatus[] {
  const connected = getConnectedServices();
  const granolaMcp = getMcpServerByPreset("granola");
  const attioMcp = getMcpServerByPreset("attio");

  return Object.entries(SERVICE_META).map(([id, meta]) => {
    const serviceId = id as ServiceId;
    const isConnected =
      id === "granola"
        ? Boolean(granolaMcp?.enabled) && hasMcpOAuthTokens(granolaMcp) && !isServiceDisabled("granola")
        : id === "attio"
          ? Boolean(attioMcp?.enabled) && hasMcpOAuthTokens(attioMcp) && !isServiceDisabled("attio")
        : id === "posthog"
          ? isPostHogConfigured()
        : id === "google"
          ? connected.includes("google") || isGoogleConnectedViaComposio()
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
  state: string,
  codeChallenge?: string
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
      return getSlackAuthUrl(redirectUri, state, codeChallenge);
    default:
      throw new Error(`Service ${service} does not support OAuth`);
  }
}

export async function exchangeCode(
  service: ServiceId,
  code: string,
  redirectUri: string,
  codeVerifier?: string
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
      return exchangeSlackCode(code, redirectUri, codeVerifier);
    default:
      throw new Error(`Service ${service} does not support OAuth`);
  }
}

// In-memory cache to avoid redundant API calls from concurrent consumers.
// TTL sits just under the renderer's 60s poll so each poll refreshes once
// and everything else (background tick, chat prompts, project inference)
// rides on that result instead of re-hitting every connector API.
let _cachedData: DatasourceData | null = null;
let _cacheTime = 0;
let _inFlight: Promise<DatasourceData> | null = null;
const DATA_CACHE_TTL = 55_000;

/** Latest cached snapshot without triggering a fetch (may be null early on). */
export function getCachedData(): DatasourceData | null {
  return _cachedData;
}

export function clearDatasourceDataCache() {
  _cachedData = null;
  _cacheTime = 0;
  _inFlight = null;
}

export async function fetchAllData(): Promise<DatasourceData> {
  // Return cached data if fresh enough
  if (_cachedData && Date.now() - _cacheTime < DATA_CACHE_TTL) {
    return _cachedData;
  }

  // Single-flight: concurrent callers share one fetch
  if (_inFlight) return _inFlight;
  _inFlight = doFetchAllData().finally(() => {
    _inFlight = null;
  });
  return _inFlight;
}

const _errors: Partial<Record<ServiceId, string>> = {};

/**
 * Run one connector fetch, settling failures instead of rejecting the whole
 * poll. On error we record the reason and fall back to the last-good value for
 * that field so a transient rate-limit/timeout doesn't blank the UI (or, worse,
 * overwrite the offline cache with an empty snapshot). `service` labels the
 * error channel; `previous` is the last-good value for this field.
 */
async function settle<T>(
  service: ServiceId,
  enabled: boolean,
  fetcher: () => Promise<T>,
  previous: T | undefined,
  empty: T,
): Promise<T> {
  if (!enabled) {
    delete _errors[service];
    return empty;
  }
  try {
    const value = await fetcher();
    delete _errors[service];
    return value;
  } catch (e) {
    _errors[service] = e instanceof Error ? e.message : String(e);
    // Keep last-good data rather than reporting "nothing" on a transient error.
    return previous ?? empty;
  }
}

async function doFetchAllData(): Promise<DatasourceData> {
  const connected = getConnectedServices();
  const googleAvailable =
    connected.includes("google") || isGoogleConnectedViaComposio();
  const prev = _cachedData;

  const mcpServers = getMcpServers().filter((s) => s.enabled);

  // Fetch everything concurrently; each connector settles independently so one
  // failure (rate-limit, expired token, hung socket) can't stall or blank the
  // rest. Google's calendar+email share one availability flag.
  const [
    calendar,
    emails,
    linearIssues,
    githubPRs,
    githubNotifications,
    notionPages,
    slackMessages,
    posthogMetrics,
    mcpSettled,
  ] = await Promise.all([
    settle("google", googleAvailable, fetchCalendarEventsAuto, prev?.calendar, []),
    settle("google", googleAvailable, fetchRecentEmailsAuto, prev?.emails, []),
    settle("linear", connected.includes("linear"), fetchLinearIssues, prev?.linearIssues, []),
    settle("github", connected.includes("github"), fetchGitHubPRs, prev?.githubPRs, []),
    settle("github", connected.includes("github"), fetchGitHubNotifications, prev?.githubNotifications, []),
    settle("notion", isNotionConnected(), fetchNotionPages, prev?.notionPages, []),
    settle("slack", connected.includes("slack"), fetchSlackMessages, prev?.slackMessages, []),
    settle("posthog", isPostHogConfigured(), fetchPostHogMetrics, prev?.posthogMetrics, {}),
    Promise.allSettled(mcpServers.map((s) => fetchMcpResources(s))),
  ]);

  const mcpResources = mcpSettled
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
    granolaMeetings: [],
    posthogMetrics,
    mcpResources: mcpResources.length > 0 ? mcpResources : undefined,
    _errors: Object.keys(_errors).length > 0 ? { ..._errors } : undefined,
  };

  _cachedData = result;
  _cacheTime = Date.now();

  return result;
}
