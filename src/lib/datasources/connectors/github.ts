import type { OAuthConfig, TokenSet, GitHubPR, GitHubNotification } from "../types";
import { getTokens } from "../token-store";

export const GITHUB_OAUTH: OAuthConfig = {
  authUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  scopes: ["repo", "read:org", "notifications"],
  clientIdEnvVar: "GITHUB_CLIENT_ID",
  clientSecretEnvVar: "GITHUB_CLIENT_SECRET",
};

export function getGitHubAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: GITHUB_OAUTH.scopes.join(" "),
    state,
  });
  return `${GITHUB_OAUTH.authUrl}?${params}`;
}

export async function exchangeGitHubCode(
  code: string,
  redirectUri: string
): Promise<TokenSet> {
  const res = await fetch(GITHUB_OAUTH.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      code,
      client_id: process.env.GITHUB_CLIENT_ID || "",
      client_secret: process.env.GITHUB_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  return {
    access_token: data.access_token,
    scope: data.scope,
    token_type: data.token_type,
    // GitHub OAuth tokens don't expire
  };
}

function getGitHubTokens(): TokenSet | null {
  return getTokens("github");
}

export async function fetchGitHubPRs(): Promise<GitHubPR[]> {
  const tokens = getGitHubTokens();
  if (!tokens) return [];

  try {
    // Fetch PRs where user is involved
    const res = await fetch(
      "https://api.github.com/search/issues?q=is:pr+is:open+involves:@me&sort=updated&per_page=15",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.items || []).map((pr: any) => {
      const repoUrl = pr.repository_url || "";
      const repo = repoUrl.split("/").slice(-2).join("/");
      const now = Date.now();
      const updated = new Date(pr.updated_at).getTime();
      const diffH = Math.round((now - updated) / 3_600_000);
      const time =
        diffH < 1 ? "just now" : diffH < 24 ? `${diffH}h ago` : `${Math.round(diffH / 24)}d ago`;

      return {
        title: pr.title,
        repo,
        author: pr.user?.login || "unknown",
        status: pr.draft ? "draft" : "open",
        time,
        url: pr.html_url,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchGitHubNotifications(): Promise<GitHubNotification[]> {
  const tokens = getGitHubTokens();
  if (!tokens) return [];

  try {
    const res = await fetch(
      "https://api.github.com/notifications?per_page=15&all=false",
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data || []).map((n: any) => {
      const now = Date.now();
      const updated = new Date(n.updated_at).getTime();
      const diffH = Math.round((now - updated) / 3_600_000);
      const time =
        diffH < 1 ? "just now" : diffH < 24 ? `${diffH}h ago` : `${Math.round(diffH / 24)}d ago`;

      return {
        title: n.subject?.title || "Untitled",
        repo: n.repository?.full_name || "",
        type: n.subject?.type || "Unknown",
        time,
        url: n.subject?.url || "",
      };
    });
  } catch {
    return [];
  }
}
