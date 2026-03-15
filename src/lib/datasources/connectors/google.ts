import type { OAuthConfig, TokenSet, CalendarEvent, EmailThread } from "../types";
import { getTokens, saveTokens } from "../token-store";

export const GOOGLE_OAUTH: OAuthConfig = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  clientIdEnvVar: "GOOGLE_CLIENT_ID",
  clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
};

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH.scopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_OAUTH.authUrl}?${params}`;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<TokenSet> {
  const res = await fetch(GOOGLE_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type,
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenSet> {
  const res = await fetch(GOOGLE_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const tokens: TokenSet = {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
  saveTokens("google", tokens);
  return tokens;
}

async function getValidGoogleTokens(): Promise<TokenSet | null> {
  const tokens = getTokens("google");
  if (!tokens) return null;

  // Refresh if expiring in < 5 minutes
  if (tokens.expires_at && tokens.expires_at < Date.now() + 300_000) {
    if (!tokens.refresh_token) return null;
    try {
      return await refreshGoogleToken(tokens.refresh_token);
    } catch {
      return null;
    }
  }
  return tokens;
}

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: weekFromNow.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!res.ok) return [];
    const data = await res.json();

    return (data.items || []).map((event: any) => {
      const start = event.start?.dateTime || event.start?.date || "";
      const end = event.end?.dateTime || event.end?.date || "";
      const startDate = new Date(start);
      const endDate = new Date(end);
      const durationMin = Math.round(
        (endDate.getTime() - startDate.getTime()) / 60_000
      );

      return {
        title: event.summary || "Untitled",
        time: startDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
        duration: durationMin >= 60 ? `${Math.round(durationMin / 60)}h` : `${durationMin}m`,
        attendees: (event.attendees || [])
          .filter((a: any) => !a.self)
          .map((a: any) => a.displayName || a.email?.split("@")[0] || "Unknown"),
        description: event.description?.slice(0, 200),
        source: "Google Calendar",
      };
    });
  } catch {
    return [];
  }
}

export async function fetchRecentEmails(): Promise<EmailThread[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  try {
    // Get recent messages
    const listRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=newer_than:2d`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json();

    const messages = listData.messages || [];
    const threads: EmailThread[] = [];

    // Fetch each message's metadata (batch of first 10)
    for (const msg of messages.slice(0, 10)) {
      try {
        const msgRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        );
        if (!msgRes.ok) continue;
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const subject =
          headers.find((h: any) => h.name === "Subject")?.value || "No subject";
        const from =
          headers.find((h: any) => h.name === "From")?.value || "Unknown";
        const unread = (msgData.labelIds || []).includes("UNREAD");

        threads.push({
          subject,
          from: from.replace(/<[^>]+>/g, "").trim(),
          snippet: msgData.snippet || "",
          time: new Date(Number(msgData.internalDate)).toLocaleString(),
          unread,
        });
      } catch {
        continue;
      }
    }

    return threads;
  } catch {
    return [];
  }
}
