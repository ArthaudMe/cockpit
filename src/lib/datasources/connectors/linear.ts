import type { OAuthConfig, TokenSet, LinearIssue } from "../types";
import { getTokens, saveTokens } from "../token-store";

export const LINEAR_OAUTH: OAuthConfig = {
  authUrl: "https://linear.app/oauth/authorize",
  tokenUrl: "https://api.linear.app/oauth/token",
  scopes: ["read", "write"],
  clientIdEnvVar: "LINEAR_CLIENT_ID",
  clientSecretEnvVar: "LINEAR_CLIENT_SECRET",
};

export function getLinearAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.LINEAR_CLIENT_ID || "",
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
  const res = await fetch(LINEAR_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.LINEAR_CLIENT_ID || "",
      client_secret: process.env.LINEAR_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope,
  };
}

async function refreshLinearToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(LINEAR_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.LINEAR_CLIENT_ID || "",
      client_secret: process.env.LINEAR_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const tokens: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
  saveTokens("linear", tokens);
  return tokens;
}

async function getValidLinearTokens(): Promise<TokenSet | null> {
  const tokens = getTokens("linear");
  if (!tokens) return null;

  if (tokens.expires_at && tokens.expires_at < Date.now() + 300_000) {
    if (!tokens.refresh_token) return null;
    try {
      return await refreshLinearToken(tokens.refresh_token);
    } catch {
      return null;
    }
  }
  return tokens;
}

export async function searchLinearIssues(searchQuery: string): Promise<LinearIssue[]> {
  const tokens = await getValidLinearTokens();
  if (!tokens) return [];

  try {
    const query = `
      query($term: String!) {
        issueSearch(query: $term, first: 15) {
          nodes {
            identifier
            title
            state { name }
            priority
            assignee { name }
            project { name }
            updatedAt
          }
        }
      }
    `;

    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({ query, variables: { term: searchQuery } }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const priorityMap: Record<number, string> = {
      0: "None",
      1: "Urgent",
      2: "High",
      3: "Normal",
      4: "Low",
    };

    return (data.data?.issueSearch?.nodes || []).map(
      (issue: any) => ({
        id: issue.identifier,
        title: issue.title,
        state: issue.state?.name || "Unknown",
        priority: priorityMap[issue.priority] || "Normal",
        assignee: issue.assignee?.name || "Unassigned",
        project: issue.project?.name,
        updatedAt: new Date(issue.updatedAt).toISOString(),
      })
    );
  } catch {
    return [];
  }
}

export async function fetchLinearIssues(): Promise<LinearIssue[]> {
  const tokens = await getValidLinearTokens();
  if (!tokens) return [];

  try {
    const query = `
      query {
        viewer {
          assignedIssues(first: 25, orderBy: updatedAt, filter: { state: { type: { nin: ["canceled", "completed"] } } }) {
            nodes {
              identifier
              title
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

    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.access_token}`,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const priorityMap: Record<number, string> = {
      0: "None",
      1: "Urgent",
      2: "High",
      3: "Normal",
      4: "Low",
    };

    return (data.data?.viewer?.assignedIssues?.nodes || []).map(
      (issue: any) => ({
        id: issue.identifier,
        title: issue.title,
        state: issue.state?.name || "Unknown",
        priority: priorityMap[issue.priority] || "Normal",
        assignee: issue.assignee?.name || "Unassigned",
        project: issue.project?.name,
        updatedAt: new Date(issue.updatedAt).toLocaleString(),
      })
    );
  } catch {
    return [];
  }
}
