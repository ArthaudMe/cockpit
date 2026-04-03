import type { DatasourceData } from "@/lib/datasources/types";
import type { SearchProvider, SearchResult } from "./types";

/** Case-insensitive substring match. Returns true if any term matches the text. */
function matches(text: string | undefined | null, terms: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

/** Score a result: title match scores higher than snippet match. */
function score(
  title: string,
  snippet: string,
  terms: string[],
  timestamp?: string,
): number {
  let s = 0;
  const titleLower = title.toLowerCase();
  const snippetLower = snippet.toLowerCase();

  for (const term of terms) {
    if (titleLower.includes(term)) s += 10;
    if (snippetLower.includes(term)) s += 3;
    // Exact word boundary bonus
    if (titleLower === term || titleLower.startsWith(term + " ")) s += 5;
  }

  // Recency boost: items from the last 24h get up to 2 extra points
  if (timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const hoursAgo = age / 3_600_000;
    if (hoursAgo < 1) s += 2;
    else if (hoursAgo < 24) s += 1;
  }

  return s;
}

export const calendarProvider: SearchProvider = {
  source: "google_calendar",
  isAvailable: (data) => !!(data.calendar && data.calendar.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const event of data.calendar || []) {
      const searchable = [
        event.title,
        event.description,
        ...event.attendees,
      ];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = event.attendees.length
          ? `${event.time} · ${event.duration} · ${event.attendees.join(", ")}`
          : `${event.time} · ${event.duration}`;
        results.push({
          id: `cal_${event.title}_${event.date}_${event.time}`,
          title: event.title,
          snippet,
          source: "google_calendar",
          timestamp: event.date,
          score: score(event.title, snippet, terms, event.date),
        });
      }
    }
    return results;
  },
};

export const linearProvider: SearchProvider = {
  source: "linear",
  isAvailable: (data) => !!(data.linearIssues && data.linearIssues.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const issue of data.linearIssues || []) {
      const searchable = [issue.title, issue.id, issue.assignee, issue.project];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = `${issue.id} · ${issue.state} · ${issue.priority} · ${issue.assignee}`;
        results.push({
          id: `linear_${issue.id}`,
          title: issue.title,
          snippet,
          source: "linear",
          timestamp: issue.updatedAt,
          score: score(issue.title, snippet, terms, issue.updatedAt),
        });
      }
    }
    return results;
  },
};

export const githubProvider: SearchProvider = {
  source: "github",
  isAvailable: (data) => !!(data.githubPRs && data.githubPRs.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const pr of data.githubPRs || []) {
      const searchable = [pr.title, pr.repo, pr.author];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = `${pr.repo} · ${pr.author} · ${pr.status}`;
        results.push({
          id: `gh_${pr.repo}_${pr.title}`,
          title: pr.title,
          snippet,
          source: "github",
          url: pr.url,
          timestamp: pr.time,
          score: score(pr.title, snippet, terms, pr.time),
        });
      }
    }
    return results;
  },
};

export const slackProvider: SearchProvider = {
  source: "slack",
  isAvailable: (data) =>
    !!(data.slackMessages && data.slackMessages.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const msg of data.slackMessages || []) {
      const searchable = [msg.message, msg.channel, msg.author];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = `${msg.author} in #${msg.channel}`;
        results.push({
          id: `slack_${msg.channel}_${msg.time}_${msg.author}`,
          title:
            msg.message.length > 80
              ? msg.message.slice(0, 80) + "..."
              : msg.message,
          snippet,
          source: "slack",
          timestamp: msg.time,
          score: score(msg.message, snippet, terms, msg.time),
        });
      }
    }
    return results;
  },
};

export const notionProvider: SearchProvider = {
  source: "notion",
  isAvailable: (data) =>
    !!(data.notionPages && data.notionPages.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const page of data.notionPages || []) {
      if (matches(page.title, terms)) {
        const snippet = page.parent
          ? `in ${page.parent} · edited ${page.lastEdited}`
          : `edited ${page.lastEdited}`;
        results.push({
          id: `notion_${page.url}`,
          title: page.title,
          snippet,
          source: "notion",
          url: page.url,
          timestamp: page.lastEdited,
          score: score(page.title, snippet, terms, page.lastEdited),
        });
      }
    }
    return results;
  },
};

export const emailProvider: SearchProvider = {
  source: "gmail",
  isAvailable: (data) => !!(data.emails && data.emails.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const email of data.emails || []) {
      const searchable = [email.subject, email.from, email.snippet];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = `From: ${email.from} — ${email.snippet.slice(0, 100)}`;
        results.push({
          id: `email_${email.subject}_${email.time}_${email.from}`,
          title: email.subject,
          snippet,
          source: "gmail",
          timestamp: email.time,
          score: score(email.subject, snippet, terms, email.time),
        });
      }
    }
    return results;
  },
};

export const granolaProvider: SearchProvider = {
  source: "granola",
  isAvailable: (data) =>
    !!(data.granolaMeetings && data.granolaMeetings.length > 0),
  search(query, data) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const results: SearchResult[] = [];
    for (const meeting of data.granolaMeetings || []) {
      const searchable = [
        meeting.title,
        ...meeting.attendees,
        meeting.summary,
        meeting.notes,
      ];
      if (searchable.some((s) => matches(s, terms))) {
        const snippet = meeting.summary
          ? meeting.summary.slice(0, 120)
          : meeting.attendees.length
            ? `With ${meeting.attendees.join(", ")}`
            : "Meeting";
        results.push({
          id: `granola_${meeting.title}_${meeting.time}`,
          title: meeting.title,
          snippet,
          source: "granola",
          timestamp: meeting.time,
          score: score(meeting.title, snippet, terms, meeting.time),
        });
      }
    }
    return results;
  },
};

/** All available client-side search providers. */
export const allProviders: SearchProvider[] = [
  calendarProvider,
  linearProvider,
  githubProvider,
  slackProvider,
  notionProvider,
  emailProvider,
  granolaProvider,
];
