import type {
  Connector,
  ConnectorData,
  CalendarEvent,
  FeedItem,
} from "./types";
import { getConnectorConfig } from "@/lib/config";

type GCalEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; self?: boolean }[];
  status: string;
};

async function refreshAccessToken(config: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Google OAuth token refresh failed: ${res.status} ${res.statusText}`,
    );
  }

  const data = await res.json();
  return data.access_token;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(startStr: string, endStr: string): string {
  const diffMs =
    new Date(endStr).getTime() - new Date(startStr).getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export class GoogleCalendarConnector implements Connector {
  id = "google-calendar" as const;
  name = "Google Calendar";

  isConfigured(): boolean {
    return !!getConnectorConfig("google-calendar");
  }

  async fetchContext(): Promise<ConnectorData> {
    const config = getConnectorConfig("google-calendar");
    if (!config) return {};

    const accessToken = await refreshAccessToken(config);

    // Get today's events
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const params = new URLSearchParams({
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Google Calendar API error: ${res.status} ${res.statusText}`,
      );
    }

    const data = await res.json();
    const events: GCalEvent[] = data.items || [];

    const calendar: CalendarEvent[] = events
      .filter((e) => e.status !== "cancelled" && e.start.dateTime)
      .map((e) => ({
        title: e.summary || "Untitled",
        time: formatTime(e.start.dateTime!),
        duration: formatDuration(e.start.dateTime!, e.end.dateTime!),
        attendees: (e.attendees || [])
          .filter((a) => !a.self)
          .map((a) => a.displayName || a.email.split("@")[0]),
      }));

    const feed: FeedItem[] = calendar.slice(0, 3).map((e) => ({
      type: "meeting",
      actor: "Calendar",
      event: `${e.title} at ${e.time} (${e.duration})`,
      project: null,
      time: e.time,
      icon: "📅",
    }));

    return { calendar, feed };
  }
}
