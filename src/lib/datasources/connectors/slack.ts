import type { OAuthConfig, TokenSet, SlackMessage } from "../types";
import { getTokens, saveTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode, proxyRefreshToken } from "../oauth-proxy";
import { fetchJson } from "../http";
import { toISO, relativeTime } from "../../time-format";
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

// Slack call helper: routes through the shared fetch (timeout + one 429 retry +
// HttpError on non-2xx). Slack additionally returns HTTP 200 with
// `{ ok: false, error }` on API errors (ratelimited, token_expired, …), so treat
// ok:false as a hard failure and throw — the manager records it and keeps
// last-good data rather than clobbering it with an empty list.
async function slackApi<T = any>(url: string, token: string): Promise<T> {
  const data = await fetchJson<any>(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    { service: "slack" },
  );
  if (!data.ok) throw new Error(`slack: ${data.error || "request failed"}`);
  return data as T;
}

async function refreshSlackToken(refreshToken: string): Promise<TokenSet> {
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyRefreshToken("slack", refreshToken);
  } else {
    const res = await fetch(SLACK_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CREDENTIALS.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });
    data = await res.json();
    if (!data.ok) throw new Error(data.error || "Slack token refresh failed");
  }

  // Rotated user tokens come back under authed_user (mirrors exchangeSlackCode).
  const accessToken = data.authed_user?.access_token || data.access_token;
  const newRefresh =
    data.authed_user?.refresh_token || data.refresh_token || refreshToken;
  const expiresIn = data.authed_user?.expires_in ?? data.expires_in;

  const tokens: TokenSet = {
    access_token: accessToken,
    refresh_token: newRefresh,
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    token_type: "Bearer",
    scope: data.authed_user?.scope || data.scope,
  };
  saveTokens("slack", tokens);
  return tokens;
}

// Guard against concurrent refresh calls — two callers racing can cause Slack to
// invalidate the first refresh token before the second uses it.
let _slackRefreshInFlight: Promise<TokenSet> | null = null;

// Slack supports token rotation, but only for workspaces that opted in: those
// token sets carry an `expires_at`. Legacy non-rotating tokens have none and are
// used as-is (behaving as before). When a rotating token is near expiry and we
// hold a refresh_token, refresh (and persist) before use.
async function getValidSlackTokens(): Promise<TokenSet | null> {
  const tokens = getSlackTokens();
  if (!tokens) return null;

  if (tokens.expires_at && tokens.expires_at < Date.now() + 300_000) {
    if (!tokens.refresh_token) return tokens; // no refresh path — try as-is
    if (_slackRefreshInFlight) return await _slackRefreshInFlight;
    _slackRefreshInFlight = refreshSlackToken(tokens.refresh_token).finally(
      () => { _slackRefreshInFlight = null; },
    );
    return await _slackRefreshInFlight;
  }
  return tokens;
}

// Cache user names to avoid repeated lookups
const userNameCache = new Map<string, string>();

async function resolveUserName(
  userId: string,
  token: string
): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;

  // Best-effort enrichment: a failed name lookup must not fail the whole poll,
  // so fall back to the raw id here rather than throwing.
  try {
    const data = await slackApi<any>(
      `https://slack.com/api/users.info?user=${userId}`,
      token,
    );
    const name = data.user?.real_name || data.user?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

export async function searchSlackMessages(query: string): Promise<SlackMessage[]> {
  const tokens = await getValidSlackTokens();
  if (!tokens) return [];

  const data = await slackApi<any>(
    `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=15&sort=timestamp&sort_dir=desc`,
    tokens.access_token,
  );

  const matches = data.messages?.matches || [];
  const messages: SlackMessage[] = [];

  for (const match of matches.slice(0, 15)) {
    const author = match.username || match.user || "unknown";
    const channelName = match.channel?.name || "unknown";
    const channelId = match.channel?.id || channelName;
    const iso = toISO(new Date(Number(match.ts) * 1000));

    messages.push({
      id: match.ts ? `slack:${channelId}:${match.ts}` : undefined,
      channel: `#${channelName}`,
      message: (match.text || "").slice(0, 200),
      author,
      // Search feeds `time` into the live-search ranker as a timestamp, so it
      // stays ISO here (see search/live-providers.ts).
      time: iso,
      timestamp: iso || undefined,
    });
  }

  return messages;
}

export async function fetchSlackMessages(): Promise<SlackMessage[]> {
  const tokens = await getValidSlackTokens();
  if (!tokens) return [];

  // Get list of channels
  const channelsData = await slackApi<any>(
    "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=20&exclude_archived=true",
    tokens.access_token,
  );

  const channels = (channelsData.channels || []).filter(
    (c: any) => c.is_member
  );
  const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  // Fetch recent messages from top channels — in parallel
  const histories = await Promise.all(
    channels.slice(0, 8).map(async (channel: any) => {
      const histData = await slackApi<any>(
        `https://slack.com/api/conversations.history?channel=${channel.id}&limit=5&oldest=${oneDayAgo}`,
        tokens.access_token,
      );
      // Filter out bot/system messages FIRST, then take the newest few — in
      // bot-heavy channels the 3 newest messages can all be bots, which would
      // otherwise slice them away and yield nothing human.
      return (histData.messages || [])
        .filter((msg: any) => !msg.subtype)
        .slice(0, 3)
        .map((msg: any) => ({ channel, msg }));
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
    // Slack `ts` is epoch seconds with a fractional part.
    const iso = toISO(new Date(Number(msg.ts) * 1000));

    return {
      id: msg.ts ? `slack:${channel.id}:${msg.ts}` : undefined,
      channel: `#${channel.name}`,
      message: (msg.text || "").slice(0, 200),
      author: nameById.get(msg.user || "unknown") || msg.user || "unknown",
      time: relativeTime(iso),
      timestamp: iso || undefined,
    };
  });

  return messages.slice(0, 15);
}
