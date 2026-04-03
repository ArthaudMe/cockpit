import type { DatasourceData, CalendarEvent } from "@/lib/datasources/types";
import { getTokens, getConnectedServices } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";

// ─── Types ──────────────────────────────────────────────────────────

export interface BackgroundNotification {
  id: string; // unique key for dedup: ruleId + entityId
  ruleId: string;
  title: string;
  body: string;
  icon: string;
  source: string;
  severity: "info" | "warning" | "urgent";
  createdAt: number; // epoch ms
  read: boolean;
}

export interface Rule {
  id: string;
  name: string;
  check: (data: DatasourceData) => BackgroundNotification[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Parse a calendar event's time + date into a Date object.
 * CalendarEvent.time is like "2:30 PM", CalendarEvent.date is "2026-04-03".
 */
function parseEventDateTime(event: CalendarEvent): Date | null {
  try {
    const timeStr = event.time; // e.g. "2:30 PM"
    const dateStr = event.date; // e.g. "2026-04-03"
    if (!timeStr || !dateStr) return null;

    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  } catch {
    return null;
  }
}

// ─── Rules ──────────────────────────────────────────────────────────

const meetingIn5Min: Rule = {
  id: "meeting-5min",
  name: "Meeting starting in 5 minutes",
  check(data) {
    if (!data.calendar?.length) return [];
    const now = Date.now();
    const notifications: BackgroundNotification[] = [];

    for (const event of data.calendar) {
      const eventTime = parseEventDateTime(event);
      if (!eventTime) continue;

      const diffMs = eventTime.getTime() - now;
      const diffMin = diffMs / 60_000;

      // Fire when meeting is between 3-6 minutes away (window for 60s polling)
      if (diffMin > 0 && diffMin <= 6 && diffMin > 0) {
        const entityId = `${event.date}-${event.time}-${event.title}`;
        notifications.push({
          id: `meeting-5min:${entityId}`,
          ruleId: "meeting-5min",
          title: "Meeting in 5 minutes",
          body: `${event.title} starts at ${event.time}`,
          icon: "CAL",
          source: event.source || "Calendar",
          severity: "warning",
          createdAt: now,
          read: false,
        });
      }
    }

    return notifications;
  },
};

const meetingIn1Min: Rule = {
  id: "meeting-1min",
  name: "Meeting starting in 1 minute",
  check(data) {
    if (!data.calendar?.length) return [];
    const now = Date.now();
    const notifications: BackgroundNotification[] = [];

    for (const event of data.calendar) {
      const eventTime = parseEventDateTime(event);
      if (!eventTime) continue;

      const diffMs = eventTime.getTime() - now;
      const diffMin = diffMs / 60_000;

      // Fire when meeting is between 0-2 minutes away
      if (diffMin > 0 && diffMin <= 2) {
        const entityId = `${event.date}-${event.time}-${event.title}`;
        notifications.push({
          id: `meeting-1min:${entityId}`,
          ruleId: "meeting-1min",
          title: "Meeting starting now",
          body: `${event.title} starts at ${event.time}`,
          icon: "CAL",
          source: event.source || "Calendar",
          severity: "urgent",
          createdAt: now,
          read: false,
        });
      }
    }

    return notifications;
  },
};

const tokenExpiring: Rule = {
  id: "token-expiring",
  name: "Datasource token expiring within 1 hour",
  check(_data) {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const notifications: BackgroundNotification[] = [];
    const connected = getConnectedServices();

    for (const serviceId of connected) {
      const tokens = getTokens(serviceId);
      if (!tokens?.expires_at) continue;

      const timeLeft = tokens.expires_at - now;

      // Token expires within 1 hour but hasn't expired yet
      // Also don't warn if there's a refresh token (it will auto-refresh)
      if (timeLeft > 0 && timeLeft < ONE_HOUR && !tokens.refresh_token) {
        notifications.push({
          id: `token-expiring:${serviceId}`,
          ruleId: "token-expiring",
          title: "Token expiring soon",
          body: `${serviceId} connection expires in ${Math.round(timeLeft / 60_000)} minutes. Reconnect in Settings.`,
          icon: "KEY",
          source: serviceId,
          severity: "warning",
          createdAt: now,
          read: false,
        });
      }
    }

    return notifications;
  },
};

// ─── Export all rules ───────────────────────────────────────────────

export const ALL_RULES: Rule[] = [meetingIn5Min, meetingIn1Min, tokenExpiring];
