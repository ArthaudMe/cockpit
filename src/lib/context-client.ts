import type { DatasourceData } from "./datasources/types";
import { compactDisplayText } from "./compact-text";

export interface FeedItem {
  id: string;
  type: string;
  actor: string;
  event: string;
  project: string | null;
  time: string;
  timeContext?: string;
  occurredAt?: string;
  icon: string;
  detail?: string;
}

export interface Context {
  user: string;
  projects: any[];
  calendar: { title: string; time: string; date?: string; duration: string; attendees: string[] }[];
  usage_analytics: Record<string, { value: number; change: string; period: string; unit?: string }>;
  slack_highlights: { channel: string; message: string; time: string }[];
  competitor_updates: { competitor: string; event: string; source: string; time: string }[];
  todos: { text: string; done: boolean }[];
  company_feed: FeedItem[];
  connected: Record<string, boolean>;
}

type FeedItemDraft = FeedItem & { sortTime: number };

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function feedId(source: string, parts: Array<string | number | null | undefined>): string {
  const normalized = parts
    .map((part) => String(part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
  return `${source}:${hashString(normalized)}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseClock(time: string): { hours: number; minutes: number } | null {
  const match = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3].toLowerCase();
  if (period === "pm" && hours !== 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;
  return { hours, minutes };
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    day: parseInt(match[3], 10),
  };
}

/** Parse display/relative timestamps into an absolute timestamp for sorting/context. */
function parseFeedTime(time: string | undefined, nowMs: number, dateKey?: string): number | null {
  if (!time) return null;
  const t = time.toLowerCase();

  if (dateKey) {
    const parsedDate = parseDateKey(dateKey);
    const clock = parseClock(time);
    if (parsedDate && clock) {
      return new Date(
        parsedDate.year,
        parsedDate.month - 1,
        parsedDate.day,
        clock.hours,
        clock.minutes,
        0,
        0,
      ).getTime();
    }
    if (parsedDate) {
      return new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day, 12, 0, 0, 0).getTime();
    }
  }

  if (t.includes("just now") || t === "now") return nowMs;

  const relative = t.match(/(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|week)s?\s*ago/);
  if (relative) {
    const amount = parseInt(relative[1], 10);
    const unit = relative[2];
    const multiplier =
      unit.startsWith("s") ? 1_000 :
      unit.startsWith("m") ? 60_000 :
      unit.startsWith("h") ? 3_600_000 :
      unit.startsWith("d") ? 86_400_000 :
      604_800_000;
    return nowMs - amount * multiplier;
  }

  const parsed = Date.parse(time);
  if (!Number.isNaN(parsed) && (/\d{4}/.test(time) || time.includes(",") || time.includes("T"))) {
    return parsed;
  }

  const clock = parseClock(time);
  if (clock) {
    const now = new Date(nowMs);
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      clock.hours,
      clock.minutes,
      0,
      0,
    ).getTime();
  }

  return null;
}

function formatFeedTimeContext(timestamp: number, nowMs: number): string {
  const date = new Date(timestamp);
  const today = new Date(nowMs);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (localDateKey(date) === localDateKey(today)) return `Today ${time}`;
  if (localDateKey(date) === localDateKey(tomorrow)) return `Tomorrow ${time}`;
  if (localDateKey(date) === localDateKey(yesterday)) return `Yesterday ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

function sortTimeFor(timestamp: number | null, nowMs: number): number {
  if (timestamp == null || Number.isNaN(timestamp)) return -Infinity;
  return timestamp <= nowMs ? timestamp : nowMs - (timestamp - nowMs);
}

function makeFeedItem(
  source: string,
  idParts: Array<string | number | null | undefined>,
  item: Omit<FeedItem, "id" | "occurredAt" | "timeContext">,
  nowMs: number,
  options: { dateKey?: string; timestamp?: number } = {},
): FeedItemDraft {
  const timestamp = options.timestamp ?? parseFeedTime(item.time, nowMs, options.dateKey);
  const occurredAt = timestamp == null ? undefined : new Date(timestamp).toISOString();
  return {
    ...item,
    id: feedId(source, idParts),
    occurredAt,
    timeContext: timestamp == null ? undefined : formatFeedTimeContext(timestamp, nowMs),
    sortTime: sortTimeFor(timestamp, nowMs),
  };
}

/** Pick the best "actor" from an attendees list, skipping the current user */
function pickActor(attendees: string[], userName?: string): string {
  if (!attendees.length) return "Meeting";
  if (!userName) return attendees[0];
  const lower = userName.toLowerCase();
  const other = attendees.find(
    (a) => !a.toLowerCase().includes(lower) && !lower.includes(a.toLowerCase())
  );
  return other || (attendees.length > 1 ? attendees[1] : "Meeting");
}

/** Build a Context from live datasource data */
export function buildContextFromLiveData(live: DatasourceData, userName?: string): Context {
  const nowMs = Date.now();
  const calendar = (live.calendar || []).map((e) => ({
    title: e.title,
    time: e.time,
    date: e.date,
    duration: e.duration,
    attendees: e.attendees,
  }));

  const slack_highlights = (live.slackMessages || []).map((s) => ({
    channel: s.channel,
    message: `${s.author}: ${s.message}`,
    time: s.time,
  }));

  const company_feed: FeedItemDraft[] = [];

  for (const e of live.calendar || []) {
    company_feed.push(
      makeFeedItem(
        "calendar",
        [e.date, e.time, e.title, e.attendees.join(",")],
        {
          type: "meeting",
          actor: pickActor(e.attendees, userName),
          event: e.title,
          project: null,
          time: e.time,
          icon: "\u{1F4C5}",
        },
        nowMs,
        { dateKey: e.date },
      ),
    );
  }

  for (const pr of live.githubPRs || []) {
    company_feed.push(
      makeFeedItem(
        "github-pr",
        [pr.url || pr.repo, pr.title, pr.author],
        {
          type: "code",
          actor: pr.author,
          event: `${pr.status === "open" ? "Opened" : "Updated"} PR: ${pr.title}`,
          project: pr.repo,
          time: pr.time,
          icon: pr.status === "open" ? "\u{1F500}" : "\u2705",
          detail: `PR: ${pr.title}\nRepo: ${pr.repo}\nAuthor: ${pr.author}\nStatus: ${pr.status}\nURL: ${pr.url}`,
        },
        nowMs,
      ),
    );
  }

  for (const n of live.githubNotifications || []) {
    company_feed.push(
      makeFeedItem(
        "github-notification",
        [n.url || n.repo, n.type, n.title],
        {
          type: "code",
          actor: "GitHub",
          event: `${n.type}: ${n.title}`,
          project: n.repo,
          time: n.time,
          icon: "\u{1F514}",
          detail: `Notification: ${n.title}\nType: ${n.type}\nRepo: ${n.repo}`,
        },
        nowMs,
      ),
    );
  }

  for (const issue of live.linearIssues || []) {
    company_feed.push(
      makeFeedItem(
        "linear-issue",
        [issue.id],
        {
          type: "code",
          actor: issue.assignee || "Unassigned",
          event: `[${issue.state}] ${issue.title}`,
          project: issue.project || null,
          time: issue.updatedAt,
          icon: "\u{1F4CB}",
          detail: `Issue: ${issue.id} — ${issue.title}\nState: ${issue.state}\nPriority: ${issue.priority}\nAssignee: ${issue.assignee}`,
        },
        nowMs,
      ),
    );
  }

  for (const s of live.slackMessages || []) {
    company_feed.push(
      makeFeedItem(
        "slack-message",
        [s.id || s.channel, s.author, s.message],
        {
          type: "message",
          actor: s.author,
          event: compactDisplayText(s.message),
          project: null,
          time: s.time,
          icon: "\u{1F4AC}",
          detail: `Slack message in ${s.channel} from ${s.author}: ${s.message}`,
        },
        nowMs,
      ),
    );
  }

  for (const m of live.granolaMeetings || []) {
    company_feed.push(
      makeFeedItem(
        "granola-meeting",
        [m.title, m.attendees.join(","), m.summary, m.notes],
        {
          type: "meeting",
          actor: pickActor(m.attendees, userName),
          event: m.title,
          project: null,
          time: m.time,
          icon: "\u{1F399}\uFE0F",
          detail: `Meeting: ${m.title}\nAttendees: ${m.attendees.join(", ") || "none"}\n${m.summary ? `Summary: ${m.summary}` : ""}${m.notes ? `\nNotes: ${m.notes.slice(0, 500)}` : ""}`,
        },
        nowMs,
      ),
    );
  }

  for (const p of live.notionPages || []) {
    company_feed.push(
      makeFeedItem(
        "notion-page",
        [p.url || p.title],
        {
          type: "code",
          actor: "Notion",
          event: `Updated: ${p.title}`,
          project: null,
          time: p.lastEdited,
          icon: "\u{1F4C4}",
          detail: `Notion page: ${p.title}\nLast edited: ${p.lastEdited}\nURL: ${p.url}`,
        },
        nowMs,
      ),
    );
  }

  for (const e of (live.emails || []).slice(0, 5)) {
    company_feed.push(
      makeFeedItem(
        "email",
        [e.from, e.subject, e.snippet],
        {
          type: "message",
          actor: e.from,
          event: e.subject,
          project: null,
          time: e.time,
          icon: "\u2709\uFE0F",
          detail: `Email from: ${e.from}\nSubject: ${e.subject}\nPreview: ${e.snippet}${e.unread ? "\n(Unread)" : ""}`,
        },
        nowMs,
      ),
    );
  }

  for (const r of live.mcpResources || []) {
    company_feed.push(
      makeFeedItem(
        "mcp-resource",
        [r.serverId, r.uri],
        {
          type: "data",
          actor: r.serverName,
          event: compactDisplayText(r.name),
          project: null,
          time: new Date(r.fetchedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }),
          icon: "\u{1F50C}",
          detail: `MCP Resource: ${r.name}\nServer: ${r.serverName}\nURI: ${r.uri}\n\n${r.text.slice(0, 500)}`,
        },
        nowMs,
        { timestamp: r.fetchedAt },
      ),
    );
  }

  company_feed.sort((a, b) => {
    return b.sortTime - a.sortTime;
  });
  const publicFeed = company_feed.map(({ sortTime, ...item }) => item);

  return {
    user: userName || "User",
    projects: [],
    calendar,
    usage_analytics: live.posthogMetrics || {},
    slack_highlights,
    competitor_updates: [],
    todos: [],
    company_feed: publicFeed,
    connected: live._connected || {},
  };
}
