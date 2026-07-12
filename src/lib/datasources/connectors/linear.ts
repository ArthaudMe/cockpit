import type { OAuthConfig, TokenSet, LinearIssue } from "../types";
import { getTokens, saveTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode, proxyRefreshToken } from "../oauth-proxy";
import { fetchJson } from "../http";
import { toISO } from "../../time-format";
import CREDENTIALS from "../credentials";

export const LINEAR_OAUTH: OAuthConfig = {
  authUrl: "https://linear.app/oauth/authorize",
  tokenUrl: "https://api.linear.app/oauth/token",
  scopes: ["read", "write"],
  clientIdEnvVar: "LINEAR_CLIENT_ID",
  clientSecretEnvVar: "LINEAR_CLIENT_SECRET",
};

export function getLinearAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CREDENTIALS.LINEAR_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: LINEAR_OAUTH.scopes.join(","),
    state,
    prompt: "consent",
    actor: "user",
  });
  return `${LINEAR_OAUTH.authUrl}?${params}`;
}

export async function exchangeLinearCode(
  code: string,
  redirectUri: string
): Promise<TokenSet> {
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyExchangeCode("linear", code, redirectUri);
  } else {
    const res = await fetch(LINEAR_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CREDENTIALS.LINEAR_CLIENT_ID,
        client_secret: process.env.LINEAR_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope,
  };
}

async function refreshLinearToken(refreshToken: string): Promise<TokenSet> {
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyRefreshToken("linear", refreshToken);
  } else {
    const res = await fetch(LINEAR_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CREDENTIALS.LINEAR_CLIENT_ID,
        client_secret: process.env.LINEAR_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });
    data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
  }

  const tokens: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  saveTokens("linear", tokens);
  return tokens;
}

// Guard against concurrent refresh calls — two callers racing can cause the
// provider to invalidate the first refresh token before the second uses it.
let _linearRefreshInFlight: Promise<TokenSet> | null = null;

async function getValidLinearTokens(): Promise<TokenSet | null> {
  const tokens = getTokens("linear");
  if (!tokens) return null;

  if (tokens.expires_at && tokens.expires_at < Date.now() + 300_000) {
    if (!tokens.refresh_token) return null;
    try {
      if (_linearRefreshInFlight) return await _linearRefreshInFlight;
      _linearRefreshInFlight = refreshLinearToken(tokens.refresh_token).finally(
        () => { _linearRefreshInFlight = null; },
      );
      return await _linearRefreshInFlight;
    } catch {
      return null;
    }
  }
  return tokens;
}

// Shared node → LinearIssue mapping (deduped from the two fetchers). Callers
// pass the human `updatedAt` display string they want; the machine-readable ISO
// `timestamp` is always derived from the raw node.updatedAt for
// dedup/search/recency.
const LINEAR_PRIORITY_MAP: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

function mapLinearNode(node: any, updatedAt: string): LinearIssue {
  return {
    id: node.identifier,
    title: node.title,
    state: node.state?.name || "Unknown",
    priority: LINEAR_PRIORITY_MAP[node.priority] || "Normal",
    assignee: node.assignee?.name || "Unassigned",
    project: node.project?.name,
    updatedAt,
    timestamp: toISO(node.updatedAt),
    url: node.url || undefined,
  };
}

// POST a GraphQL request through the shared HTTP helpers (timeout + non-2xx →
// HttpError). Linear returns HTTP 200 with a populated `errors` array on query
// failure, so treat that as a hard error too rather than returning [].
async function linearGraphQL(accessToken: string, body: object): Promise<any> {
  const data: any = await fetchJson(
    "https://api.linear.app/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
    { service: "linear" },
  );
  if (Array.isArray(data?.errors) && data.errors.length) {
    const message = data.errors
      .map((e: any) => e?.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(message || "Linear GraphQL error");
  }
  return data;
}

export async function searchLinearIssues(searchQuery: string): Promise<LinearIssue[]> {
  const tokens = await getValidLinearTokens();
  if (!tokens) return [];

  const query = `
    query($term: String!) {
      issueSearch(query: $term, first: 15) {
        nodes {
          identifier
          title
          url
          state { name }
          priority
          assignee { name }
          project { name }
          updatedAt
        }
      }
    }
  `;

  const data = await linearGraphQL(tokens.access_token, {
    query,
    variables: { term: searchQuery },
  });

  return (data.data?.issueSearch?.nodes || []).map((node: any) =>
    mapLinearNode(node, toISO(node.updatedAt)),
  );
}

export async function fetchLinearIssues(): Promise<LinearIssue[]> {
  const tokens = await getValidLinearTokens();
  if (!tokens) return [];

  const query = `
    query {
      viewer {
        assignedIssues(first: 25, orderBy: updatedAt, filter: { state: { type: { nin: ["canceled", "completed"] } } }) {
          nodes {
            identifier
            title
            url
            state { name }
            priority
            assignee { name }
            project { name }
            updatedAt
          }
        }
      }
    }
  `;

  const data = await linearGraphQL(tokens.access_token, { query });

  return (data.data?.viewer?.assignedIssues?.nodes || []).map((node: any) =>
    mapLinearNode(node, new Date(node.updatedAt).toLocaleString()),
  );
}
