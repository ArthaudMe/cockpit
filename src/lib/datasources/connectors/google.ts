import type { OAuthConfig, TokenSet, CalendarEvent, EmailThread } from "../types";
import { getTokens, saveTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode, proxyRefreshToken } from "../oauth-proxy";
import CREDENTIALS from "../credentials";

export const GOOGLE_OAUTH: OAuthConfig = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  clientIdEnvVar: "GOOGLE_CLIENT_ID",
  clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
};

export function getGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CREDENTIALS.GOOGLE_CLIENT_ID,
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
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyExchangeCode("google", code, redirectUri);
  } else {
    const res = await fetch(GOOGLE_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CREDENTIALS.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
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
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    token_type: data.token_type,
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenSet> {
  let data: any;

  if (isProxyEnabled()) {
    data = await proxyRefreshToken("google", refreshToken);
  } else {
    const res = await fetch(GOOGLE_OAUTH.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: CREDENTIALS.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });
    data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
  }

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
        date: startDate.toISOString().split("T")[0],
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

export async function searchCalendarEvents(query: string): Promise<CalendarEvent[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const threeMonthsAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      q: query,
      timeMin: threeMonthsAgo.toISOString(),
      timeMax: threeMonthsAhead.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "15",
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
        date: startDate.toISOString().split("T")[0],
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

export async function searchEmails(query: string): Promise<EmailThread[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  try {
    const listRes = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    if (!listRes.ok) return [];
    const listData = await listRes.json();

    const messages = listData.messages || [];
    const threads: EmailThread[] = [];

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
          time: new Date(Number(msgData.internalDate)).toISOString(),
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

// ─── Write Actions ────────────────────────────────────────────────

export async function createCalendarEvent(params: {
  summary: string;
  start: string;
  end: string;
  description?: string;
  attendees?: string[];
}): Promise<{ success: boolean; message: string; url?: string }> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return { success: false, message: "Google not connected. Please reconnect Google in Settings." };

  const body: Record<string, unknown> = {
    summary: params.summary,
    start: { dateTime: params.start },
    end: { dateTime: params.end },
  };
  if (params.description) body.description = params.description;
  if (params.attendees?.length) {
    body.attendees = params.attendees.map((email) => ({ email }));
  }

  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, message: "Couldn't create the calendar event. Please check your Google connection and try again." };
    }

    const data = await res.json();
    return {
      success: true,
      message: `Created event: ${data.summary}`,
      url: data.htmlLink,
    };
  } catch (err) {
    return { success: false, message: "Couldn't reach Google Calendar. Please check your internet connection." };
  }
}

export async function createGmailDraft(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; message: string; url?: string }> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return { success: false, message: "Google not connected. Please reconnect Google in Settings." };

  // Build RFC 2822 message
  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.body,
  ].join("\r\n");

  // Base64url encode
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    const res = await fetch(
      "https://www.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: { raw: encoded },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, message: "Couldn't create the email draft. Please check your Google connection and try again." };
    }

    const data = await res.json();
    return {
      success: true,
      message: `Draft created: "${params.subject}" to ${params.to}`,
      url: `https://mail.google.com/mail/#drafts/${data.message?.id || ""}`,
    };
  } catch (err) {
    return { success: false, message: "Couldn't reach Gmail. Please check your internet connection." };
  }
}
