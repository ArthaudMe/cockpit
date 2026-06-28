import type { OAuthConfig, TokenSet, SlackMessage } from "../types";
import { getTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode } from "../oauth-proxy";
import CREDENTIALS from "../credentials";

export const SLACK_OAUTH: OAuthConfig = {
  authUrl: "https://slack.com/oauth/v2/authorize",
  tokenUrl: "https://slack.com/api/oauth.v2.access",
  scopes: [
    "channels:read",
    "channels:history",
    "groups:read",
    "groups:history",
    "users:read",
    "im:history",
    "mpim:history",
    "search:read",
    "chat:write",
  ],
  clientIdEnvVar: "SLACK_CLIENT_ID",
  clientSecretEnvVar: "SLACK_CLIENT_SECRET",
};

export function getSlackAuthUrl(redirectUri: string, state: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    client_id: CREDENTIALS.SLACK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "", // Bot scopes go in scope, user scopes in user_scope
    user_scope: SLACK_OAUTH.scopes.join(","),
    state,
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${SLACK_OAUTH.authUrl}?${params}`;
}

export async function exchangeSlackCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<TokenSet> {
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyExchangeCode("slack", code, redirectUri, codeVerifier);
  } else {
    const params: Record<string, string> = {
      code,
      client_id: CREDENTIALS.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
    };
    if (codeVerifier) params.code_verifier = codeVerifier;
    const res = await fetch(SLACK_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    data = await res.json();
    if (!data.ok) throw new Error(data.error || "Slack OAuth failed");
  }

  // Slack returns user token in authed_user for user-scoped tokens
  const userToken = data.authed_user?.access_token || data.access_token;

  return {
    access_token: userToken,
    refresh_token: data.authed_user?.refresh_token,
    token_type: "Bearer",
    scope: data.authed_user?.scope || data.scope,
  };
}

function getSlackTokens(): TokenSet | null {
  return getTokens("slack");
}

// Cache user names to avoid repeated lookups
const userNameCache = new Map<string, string>();

async function resolveUserName(
  userId: string,
  token: string
): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;

  try {
    const res = await fetch(
      `https://slack.com/api/users.info?user=${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const name =
      data.user?.real_name || data.user?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

export async function searchSlackMessages(query: string): Promise<SlackMessage[]> {
  const tokens = getSlackTokens();
  if (!tokens) return [];

  try {
    const res = await fetch(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=15&sort=timestamp&sort_dir=desc`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const data = await res.json();
    if (!data.ok) return [];

    const matches = data.messages?.matches || [];
    const messages: SlackMessage[] = [];

    for (const match of matches.slice(0, 15)) {
      const author = match.username || match.user || "unknown";
      const channelName = match.channel?.name || "unknown";
      const ts = Number(match.ts) * 1000;

      messages.push({
        id: match.ts ? `slack:${channelName}:${match.ts}` : undefined,
        channel: `#${channelName}`,
        message: (match.text || "").slice(0, 200),
        author,
        time: new Date(ts).toISOString(),
      });
    }

    return messages;
  } catch {
    return [];
  }
}

export async function fetchSlackMessages(): Promise<SlackMessage[]> {
  const tokens = getSlackTokens();
  if (!tokens) return [];

  try {
    // Get list of channels
    const channelsRes = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20&exclude_archived=true",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!channelsRes.ok) return [];
    const channelsData = await channelsRes.json();
    if (!channelsData.ok) return [];

    const channels = (channelsData.channels || []).filter(
      (c: any) => c.is_member
    );
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

    // Fetch recent messages from top channels — in parallel
    const histories = await Promise.all(
      channels.slice(0, 8).map(async (channel: any) => {
        try {
          const histRes = await fetch(
            `https://slack.com/api/conversations.history?channel=${channel.id}&limit=5&oldest=${oneDayAgo}`,
            { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          );
          const histData = await histRes.json();
          if (!histData.ok) return [];
          return (histData.messages || [])
            .slice(0, 3)
            .filter((msg: any) => !msg.subtype) // Skip bot/system messages
            .map((msg: any) => ({ channel, msg }));
        } catch {
          return [];
        }
      })
    );
    const rawMessages = histories.flat();

    // Resolve all distinct author names in parallel (cache-backed)
    const userIds = [...new Set<string>(rawMessages.map(({ msg }: any) => msg.user || "unknown"))];
    const names = await Promise.all(
      userIds.map((id) => resolveUserName(id, tokens.access_token))
    );
    const nameById = new Map(userIds.map((id, i) => [id, names[i]]));

    const messages: SlackMessage[] = rawMessages.map(({ channel, msg }: any) => {
      const ts = Number(msg.ts) * 1000;
      const diffH = Math.round((Date.now() - ts) / 3_600_000);
      const time =
        diffH < 1
          ? "just now"
          : diffH < 24
            ? `${diffH}h ago`
            : `${Math.round(diffH / 24)}d ago`;

      return {
        id: msg.ts ? `slack:${channel.id}:${msg.ts}` : undefined,
        channel: `#${channel.name}`,
        message: (msg.text || "").slice(0, 200),
        author: nameById.get(msg.user || "unknown") || msg.user || "unknown",
        time,
      };
    });

    return messages.slice(0, 15);
  } catch {
    return [];
  }
}
