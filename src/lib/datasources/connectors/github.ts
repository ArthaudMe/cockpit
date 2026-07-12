import type { OAuthConfig, TokenSet, GitHubPR, GitHubNotification } from "../types";
import { getTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode } from "../oauth-proxy";
import { fetchJson } from "../http";
import { toISO, relativeTime } from "../../time-format";
import CREDENTIALS from "../credentials";

export const GITHUB_OAUTH: OAuthConfig = {
  authUrl: "https://github.com/login/oauth/authorize",
  tokenUrl: "https://github.com/login/oauth/access_token",
  scopes: ["repo", "read:org", "notifications"],
  clientIdEnvVar: "GITHUB_CLIENT_ID",
  clientSecretEnvVar: "GITHUB_CLIENT_SECRET",
};

export function getGitHubAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CREDENTIALS.GITHUB_CLIENT_ID,
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
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyExchangeCode("github", code, redirectUri);
  } else {
    const res = await fetch(GITHUB_OAUTH.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        code,
        client_id: CREDENTIALS.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
      }),
    });
    data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
  }

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

type GitHubHeaders = {
  Authorization: string;
  Accept: string;
  "X-GitHub-Api-Version": string;
};

function githubHeaders(token: string): GitHubHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// The org list is effectively static across a session, but /user/orgs was being
// refetched on every poll. Cache it in-memory with a long TTL.
const ORGS_TTL_MS = 30 * 60 * 1000;
let _orgsCache: { names: string[]; at: number } | null = null;

async function getOrgNames(headers: GitHubHeaders): Promise<string[]> {
  if (_orgsCache && Date.now() - _orgsCache.at < ORGS_TTL_MS) {
    return _orgsCache.names;
  }
  const orgs = await fetchJson<any[]>(
    "https://api.github.com/user/orgs?per_page=10",
    { headers },
    { service: "github" },
  );
  const names = (orgs || []).map((o: any) => o.login);
  _orgsCache = { names, at: Date.now() };
  return names;
}

export async function fetchGitHubPRs(): Promise<GitHubPR[]> {
  const tokens = getGitHubTokens();
  if (!tokens) return [];

  const headers = githubHeaders(tokens.access_token);

  // Get the user's orgs to scope the search to the teams they belong to.
  const orgNames = await getOrgNames(headers);

  // Scope to the user's own open PRs. Without `involves:@me`, an org-wide
  // `is:pr is:open` search returns up to 25 PRs from anyone in the org and
  // buries the user's own work.
  const orgFilter =
    orgNames.length > 0
      ? `${orgNames.map((o: string) => `org:${o}`).join("+")}+involves:@me`
      : "involves:@me";
  const data = await fetchJson<any>(
    `https://api.github.com/search/issues?q=is:pr+is:open+${orgFilter}&sort=updated&per_page=25`,
    { headers },
    { service: "github" },
  );

  return (data.items || []).map((pr: any) => {
    const repoUrl = pr.repository_url || "";
    const repo = repoUrl.split("/").slice(-2).join("/");
    const iso = toISO(pr.updated_at);

    return {
      title: pr.title,
      repo,
      author: pr.user?.login || "unknown",
      status: pr.draft ? "draft" : "open",
      time: relativeTime(iso),
      timestamp: iso || undefined,
      url: pr.html_url,
    };
  });
}

export async function searchGitHub(query: string): Promise<GitHubPR[]> {
  const tokens = getGitHubTokens();
  if (!tokens) return [];

  const data = await fetchJson<any>(
    `https://api.github.com/search/issues?q=${encodeURIComponent(query)}+involves:@me&sort=updated&per_page=15`,
    { headers: githubHeaders(tokens.access_token) },
    { service: "github" },
  );

  return (data.items || []).map((item: any) => {
    const repoUrl = item.repository_url || "";
    const repo = repoUrl.split("/").slice(-2).join("/");
    const iso = toISO(item.updated_at);

    return {
      title: item.title,
      repo,
      author: item.user?.login || "unknown",
      status: item.pull_request
        ? item.draft ? "draft" : item.state
        : `issue:${item.state}`,
      // Search feeds `time` into the live-search ranker as a timestamp, so it
      // stays ISO here (see search/live-providers.ts).
      time: iso,
      timestamp: iso || undefined,
      url: item.html_url,
    };
  });
}

// The notifications API exposes `subject.url` as an api.github.com URL, which
// renders raw JSON in a browser. Rewrite it to the corresponding web page.
function notificationWebUrl(n: any): string {
  const apiUrl: string = n.subject?.url || "";
  const m = apiUrl.match(
    /api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)/,
  );
  if (m) {
    const [, owner, repo, kind, num] = m;
    const webKind = kind === "pulls" ? "pull" : "issues";
    return `https://github.com/${owner}/${repo}/${webKind}/${num}`;
  }
  // Unexpected shape — fall back to the repo page, then the raw API url.
  return n.repository?.html_url || apiUrl || "";
}

export async function fetchGitHubNotifications(): Promise<GitHubNotification[]> {
  const tokens = getGitHubTokens();
  if (!tokens) return [];

  const data = await fetchJson<any>(
    "https://api.github.com/notifications?per_page=15&all=false",
    { headers: githubHeaders(tokens.access_token) },
    { service: "github" },
  );

  return (data || []).map((n: any) => {
    const iso = toISO(n.updated_at);

    return {
      title: n.subject?.title || "Untitled",
      repo: n.repository?.full_name || "",
      type: n.subject?.type || "Unknown",
      time: relativeTime(iso),
      timestamp: iso || undefined,
      url: notificationWebUrl(n),
    };
  });
}
