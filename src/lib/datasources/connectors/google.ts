import type { OAuthConfig, TokenSet, CalendarEvent, EmailThread } from "../types";
import { getTokens, saveTokens } from "../token-store";
import { isProxyEnabled, proxyExchangeCode, proxyRefreshToken } from "../oauth-proxy";
import CREDENTIALS from "../credentials";
import { executeAction, isComposioEnabled } from "../composio";
import { isGoogleConnectedViaComposio } from "../token-store";
import { fetchJson, fetchWithTimeout } from "../http";
import { toISO, relativeTime } from "../../time-format";

/**
 * Raised by the token-refresh path. `invalidGrant` is set when Google reports
 * `invalid_grant` — the refresh token is dead and the account is effectively
 * disconnected (callers should treat as "not connected"). Any other failure is
 * a transient network/timeout error and should propagate so the datasource
 * manager keeps the last-good data instead of showing an empty state.
 */
class GoogleAuthError extends Error {
  invalidGrant: boolean;
  constructor(message: string, invalidGrant: boolean) {
    super(message);
    this.name = "GoogleAuthError";
    this.invalidGrant = invalidGrant;
  }
}

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
    // fetchWithTimeout throws on a network/timeout failure (transient) — we let
    // that propagate. A well-formed HTTP error response (e.g. invalid_grant) is
    // handled below and mapped to a GoogleAuthError.
    const res = await fetchWithTimeout(
      GOOGLE_OAUTH.tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          client_id: CREDENTIALS.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          grant_type: "refresh_token",
        }),
      },
      { service: "google" },
    );
    data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      const code = data.error || `HTTP ${res.status}`;
      throw new GoogleAuthError(
        data.error_description || code,
        data.error === "invalid_grant",
      );
    }
  }

  const tokens: TokenSet = {
    access_token: data.access_token,
    // Google may rotate the refresh token; persist the new one when present,
    // otherwise keep the existing one.
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
  saveTokens("google", tokens);
  return tokens;
}

// Guard against concurrent refresh calls — two callers racing can cause the
// provider to invalidate the first refresh token before the second uses it.
let _googleRefreshInFlight: Promise<TokenSet> | null = null;

async function getValidGoogleTokens(): Promise<TokenSet | null> {
  const tokens = getTokens("google");
  if (!tokens) return null;

  // Refresh if expiring in < 5 minutes
  if (tokens.expires_at && tokens.expires_at < Date.now() + 300_000) {
    if (!tokens.refresh_token) return null;
    try {
      if (_googleRefreshInFlight) return await _googleRefreshInFlight;
      _googleRefreshInFlight = refreshGoogleToken(tokens.refresh_token).finally(
        () => { _googleRefreshInFlight = null; },
      );
      return await _googleRefreshInFlight;
    } catch (err) {
      // invalid_grant => the refresh token is dead; treat as disconnected.
      if (err instanceof GoogleAuthError && err.invalidGrant) return null;
      // Transient network/timeout during refresh: rethrow so the manager keeps
      // last-good data instead of collapsing to an empty (disconnected) state.
      throw err;
    }
  }
  return tokens;
}

// ─── Shared mappers ───────────────────────────────────────────────
// One implementation each for the Google Calendar event → CalendarEvent and
// Gmail message → EmailThread shapes, used by every direct + Composio path so
// the timezone handling and the machine-readable `timestamp` live in one place.

// The `& { timestamp?: string }` keeps this compiling while the optional
// `timestamp` field is being added to CalendarEvent/EmailThread in types.ts; it
// collapses to the plain interface once that field lands.
/** Google Calendar event (v3 API or Composio) → CalendarEvent. */
function mapGoogleEvent(event: any): CalendarEvent & { timestamp?: string } {
  const startDateTime: string | undefined = event.start?.dateTime;
  const startAllDay: string | undefined = event.start?.date;
  const isAllDay = !startDateTime && !!startAllDay;

  const startRaw = startDateTime || startAllDay || "";
  const endRaw = event.end?.dateTime || event.end?.date || "";

  let date: string;
  let time: string;
  let timestamp: string;

  if (isAllDay) {
    // All-day events carry a bare YYYY-MM-DD with no clock time — keep the date
    // verbatim (do NOT round-trip through toISOString, which shifts by the UTC
    // offset) and mark the time as all-day.
    date = startAllDay!;
    time = "All day";
    timestamp = toISO(startAllDay!);
  } else {
    // Timed events: the RFC3339 dateTime already carries the correct local date
    // + offset, so slice the local calendar date straight from the string
    // rather than deriving it from a UTC ISO conversion.
    date = startRaw.slice(0, 10);
    time = new Date(startRaw).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    timestamp = toISO(startRaw);
  }

  const durationMin = Math.round(
    (new Date(endRaw).getTime() - new Date(startRaw).getTime()) / 60_000,
  );

  return {
    title: event.summary || "Untitled",
    time,
    date,
    duration:
      durationMin >= 60 ? `${Math.round(durationMin / 60)}h` : `${durationMin}m`,
    attendees: (event.attendees || [])
      .filter((a: any) => !a.self)
      .map((a: any) => a.displayName || a.email?.split("@")[0] || "Unknown"),
    description: event.description?.slice(0, 200),
    source: "Google Calendar",
    timestamp,
  };
}

/** Gmail message (v1 metadata or Composio payload) → EmailThread. */
function mapGmailMessage(msg: any): EmailThread & { timestamp?: string } {
  const headers = msg.payload?.headers || [];
  const subject =
    headers.find((h: any) => h.name === "Subject")?.value ||
    msg.subject ||
    "No subject";
  const from =
    headers.find((h: any) => h.name === "From")?.value || msg.from || "Unknown";
  const unread = msg.labelIds
    ? (msg.labelIds as string[]).includes("UNREAD")
    : msg.unread ?? false;

  const timestamp = msg.internalDate
    ? toISO(Number(msg.internalDate))
    : toISO(msg.date);

  return {
    subject,
    from: from.replace(/<[^>]+>/g, "").trim(),
    snippet: msg.snippet || "",
    time: timestamp ? relativeTime(timestamp) : "",
    timestamp,
    unread,
  };
}

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  // Errors (non-2xx, network/timeout) propagate so the manager can record the
  // failure and keep last-good data instead of showing an empty calendar.
  const data = await fetchJson<any>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    { service: "google" },
  );

  return (data.items || []).map(mapGoogleEvent);
}

export async function searchCalendarEvents(query: string): Promise<CalendarEvent[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) {
    // Fall through to Composio if available
    if (useComposio()) return searchCalendarEventsViaComposio(query);
    return [];
  }

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

  const data = await fetchJson<any>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    { service: "google" },
  );

  return (data.items || []).map(mapGoogleEvent);
}

export async function searchEmails(query: string): Promise<EmailThread[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) {
    if (useComposio()) return searchEmailsViaComposio(query);
    return [];
  }

  const listData = await fetchJson<any>(
    `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    { service: "google" },
  );

  const messages = (listData.messages || []).slice(0, 10);

  // Fetch message metadata in parallel — one hung/failed fetch surfaces as a
  // thrown error rather than silently dropping results.
  return Promise.all(
    messages.map((msg: any) =>
      fetchJson<any>(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        { service: "google" },
      ).then(mapGmailMessage),
    ),
  );
}

export async function fetchRecentEmails(): Promise<EmailThread[]> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return [];

  // Get recent messages
  const listData = await fetchJson<any>(
    `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=newer_than:2d`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    { service: "google" },
  );

  const messages = (listData.messages || []).slice(0, 10);

  // Fetch each message's metadata in parallel (was 10 serial round-trips).
  return Promise.all(
    messages.map((msg: any) =>
      fetchJson<any>(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        { service: "google" },
      ).then(mapGmailMessage),
    ),
  );
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

  // Google 400s on a naive datetime (no offset/Z) unless a timeZone accompanies
  // it. Provide the system IANA zone as a fallback; when the datetime already
  // carries an explicit offset that offset governs the instant.
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body: Record<string, unknown> = {
    summary: params.summary,
    start: { dateTime: params.start, timeZone },
    end: { dateTime: params.end, timeZone },
  };
  if (params.description) body.description = params.description;
  if (params.attendees?.length) {
    body.attendees = params.attendees.map((email) => ({ email }));
  }

  const res = await fetchWithTimeout(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { service: "google" },
  );

  if (!res.ok) {
    // Surface Google's own error message (e.g. "Invalid start time") to the user
    // instead of swallowing it behind a generic string.
    const err = await res.json().catch(() => ({} as any));
    const reason =
      err?.error?.message || err?.error_description || err?.error || `HTTP ${res.status}`;
    throw new Error(`Couldn't create the calendar event: ${reason}`);
  }

  const data = await res.json();
  return {
    success: true,
    message: `Created event: ${data.summary}`,
    url: data.htmlLink,
  };
}

// ─── Composio-backed Google data ─────────────────────────────────
// When Composio is configured, these functions replace direct API calls.
// They use Composio's managed OAuth so we skip Google's CASA verification.

function useComposio(): boolean {
  return isComposioEnabled() && isGoogleConnectedViaComposio();
}

export async function fetchCalendarEventsViaComposio(): Promise<CalendarEvent[]> {
  try {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const result = await executeAction("GOOGLECALENDAR_EVENTS_LIST", {
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: weekFromNow.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });

    const items = (result.items ?? result.events ?? []) as any[];
    return items.map(mapGoogleEvent);
  } catch (err) {
    console.error("[Google/Composio] calendar fetch error:", err);
    return [];
  }
}

export async function fetchRecentEmailsViaComposio(): Promise<EmailThread[]> {
  try {
    const result = await executeAction("GMAIL_FETCH_EMAILS", {
      query: "newer_than:2d",
      max_results: 15,
      include_payload: true,
    });

    const messages = (result.messages ?? result.data ?? []) as any[];
    return messages.slice(0, 10).map(mapGmailMessage);
  } catch (err) {
    console.error("[Google/Composio] email fetch error:", err);
    return [];
  }
}

async function searchCalendarEventsViaComposio(query: string): Promise<CalendarEvent[]> {
  try {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const threeMonthsAhead = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const result = await executeAction("GOOGLECALENDAR_FIND_EVENT", {
      query,
      time_min: threeMonthsAgo.toISOString(),
      time_max: threeMonthsAhead.toISOString(),
      single_events: true,
      order_by: "startTime",
    });

    const items = (result.items ?? result.events ?? []) as any[];
    return items.slice(0, 15).map(mapGoogleEvent);
  } catch (err) {
    console.error("[Google/Composio] calendar search error:", err);
    return [];
  }
}

async function searchEmailsViaComposio(query: string): Promise<EmailThread[]> {
  try {
    const result = await executeAction("GMAIL_FETCH_EMAILS", {
      query,
      max_results: 10,
      include_payload: true,
    });

    const messages = (result.messages ?? result.data ?? []) as any[];
    return messages.slice(0, 10).map(mapGmailMessage);
  } catch (err) {
    console.error("[Google/Composio] email search error:", err);
    return [];
  }
}

export async function createCalendarEventViaComposio(params: {
  summary: string;
  start: string;
  end: string;
  description?: string;
  attendees?: string[];
}): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    const result = await executeAction("GOOGLECALENDAR_CREATE_EVENT", {
      summary: params.summary,
      start_datetime: params.start,
      end_datetime: params.end,
      ...(params.description && { description: params.description }),
      ...(params.attendees?.length && { attendees: params.attendees }),
    });

    return {
      success: true,
      message: `Created event: ${params.summary}`,
      url: (result as any).htmlLink,
    };
  } catch (err) {
    console.error("[Google/Composio] create event error:", err);
    return {
      success: false,
      message: "Couldn't create the calendar event via Composio.",
    };
  }
}

export async function sendEmailViaComposio(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    await executeAction("GMAIL_SEND_EMAIL", {
      recipient_email: params.to,
      subject: params.subject,
      body: params.body,
    });

    return {
      success: true,
      message: `Email sent to ${params.to}: "${params.subject}"`,
    };
  } catch (err) {
    console.error("[Google/Composio] send email error:", err);
    return {
      success: false,
      message: "Couldn't send the email via Composio.",
    };
  }
}

export async function createGmailDraftViaComposio(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; message: string; url?: string }> {
  try {
    const result = await executeAction("GMAIL_CREATE_EMAIL_DRAFT", {
      recipient_email: params.to,
      subject: params.subject,
      body: params.body,
    });

    return {
      success: true,
      message: `Draft created: "${params.subject}" to ${params.to}`,
      url: `https://mail.google.com/mail/#drafts`,
    };
  } catch (err) {
    console.error("[Google/Composio] create draft error:", err);
    return {
      success: false,
      message: "Couldn't create the email draft via Composio.",
    };
  }
}

// ─── Unified exports (auto-select Composio vs direct OAuth) ─────

export async function fetchCalendarEventsAuto(): Promise<CalendarEvent[]> {
  return useComposio()
    ? fetchCalendarEventsViaComposio()
    : fetchCalendarEvents();
}

export async function fetchRecentEmailsAuto(): Promise<EmailThread[]> {
  return useComposio()
    ? fetchRecentEmailsViaComposio()
    : fetchRecentEmails();
}

export async function createCalendarEventAuto(params: {
  summary: string;
  start: string;
  end: string;
  description?: string;
  attendees?: string[];
}): Promise<{ success: boolean; message: string; url?: string }> {
  return useComposio()
    ? createCalendarEventViaComposio(params)
    : createCalendarEvent(params);
}

export async function createGmailDraftAuto(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; message: string; url?: string }> {
  return useComposio()
    ? createGmailDraftViaComposio(params)
    : createGmailDraft(params);
}

// ─── Direct OAuth write actions (original) ───────────────────────

// Very small address shape check — enough to reject header-injection payloads
// and obviously malformed input without pulling in a validation library.
const EMAIL_RE = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/** Reject any header value containing a CR or LF (header/SMTP injection). */
function assertNoHeaderInjection(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid ${field}: header values must not contain line breaks.`);
  }
}

/**
 * Validate a To/Cc header: a comma-separated list of addresses, each either a
 * bare `user@host` or a `Name <user@host>` form. Throws on anything that does
 * not parse as an email address.
 */
function assertEmailHeader(value: string, field: string): void {
  assertNoHeaderInjection(value, field);
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error(`Invalid ${field}: no address provided.`);
  for (const part of parts) {
    const angle = part.match(/<([^>]+)>/);
    const addr = (angle ? angle[1] : part).trim();
    if (!EMAIL_RE.test(addr)) {
      throw new Error(`Invalid ${field}: "${part}" is not a valid email address.`);
    }
  }
}

/** RFC 2047 encode a header value when it contains non-ASCII characters. */
function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export async function createGmailDraft(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ success: boolean; message: string; url?: string }> {
  const tokens = await getValidGoogleTokens();
  if (!tokens) return { success: false, message: "Google not connected. Please reconnect Google in Settings." };

  // Sanitize header-bound params (they originate from LLM tool calls that are
  // only validated as non-empty). Throws a clear Error on injection/bad input.
  assertEmailHeader(params.to, "to");
  assertNoHeaderInjection(params.subject, "subject");
  const encodedSubject = encodeHeaderWord(params.subject);

  // Build RFC 2822 message
  const rawMessage = [
    `To: ${params.to}`,
    `Subject: ${encodedSubject}`,
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
