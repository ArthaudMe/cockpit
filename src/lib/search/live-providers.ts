import type { LiveSearchProvider, SearchResult, SearchSource } from "./types";
import { getConnectedServices } from "@/lib/datasources/token-store";
import { isNotionConnected } from "@/lib/datasources/connectors/notion";
import { searchCalendarEvents, searchEmails } from "@/lib/datasources/connectors/google";
import { searchLinearIssues } from "@/lib/datasources/connectors/linear";
import { searchGitHub } from "@/lib/datasources/connectors/github";
import { searchNotionPages } from "@/lib/datasources/connectors/notion";

const googleLive: LiveSearchProvider = {
  sources: ["google_calendar", "gmail"],
  isConnected() {
    return getConnectedServices().includes("google");
  },
  async search(query: string): Promise<SearchResult[]> {
    const [calEvents, emails] = await Promise.all([
      searchCalendarEvents(query),
      searchEmails(query),
    ]);

    const results: SearchResult[] = [];

    for (const event of calEvents) {
      results.push({
        id: `live_cal_${event.title}_${event.date}_${event.time}`,
        title: event.title,
        snippet: `${event.date} ${event.time} · ${event.duration}${event.attendees.length ? ` · ${event.attendees.join(", ")}` : ""}`,
        source: "google_calendar",
        timestamp: event.date,
      });
    }

    for (const email of emails) {
      results.push({
        id: `live_email_${email.subject}_${email.time}`,
        title: email.subject,
        snippet: `From: ${email.from} — ${email.snippet.slice(0, 100)}`,
        source: "gmail",
        timestamp: email.time,
      });
    }

    return results;
  },
};

const linearLive: LiveSearchProvider = {
  sources: ["linear"],
  isConnected() {
    return getConnectedServices().includes("linear");
  },
  async search(query: string): Promise<SearchResult[]> {
    const issues = await searchLinearIssues(query);
    return issues.map((issue) => ({
      id: `live_linear_${issue.id}`,
      title: issue.title,
      snippet: `${issue.id} · ${issue.state} · ${issue.priority} · ${issue.assignee}`,
      source: "linear" as SearchSource,
      timestamp: issue.updatedAt,
    }));
  },
};

const githubLive: LiveSearchProvider = {
  sources: ["github"],
  isConnected() {
    return getConnectedServices().includes("github");
  },
  async search(query: string): Promise<SearchResult[]> {
    const items = await searchGitHub(query);
    return items.map((pr) => ({
      id: `live_gh_${pr.repo}_${pr.title}`,
      title: pr.title,
      snippet: `${pr.repo} · ${pr.author} · ${pr.status}`,
      source: "github" as SearchSource,
      url: pr.url,
      timestamp: pr.time,
    }));
  },
};

const notionLive: LiveSearchProvider = {
  sources: ["notion"],
  isConnected() {
    return isNotionConnected();
  },
  async search(query: string): Promise<SearchResult[]> {
    const pages = await searchNotionPages(query);
    return pages.map((page) => ({
      id: `live_notion_${page.url}`,
      title: page.title,
      snippet: `${page.parent ? `in ${page.parent} · ` : ""}edited ${page.lastEdited}`,
      source: "notion" as SearchSource,
      url: page.url,
      timestamp: page.lastEdited,
    }));
  },
};

export const allLiveProviders: LiveSearchProvider[] = [
  googleLive,
  linearLive,
  githubLive,
  notionLive,
];
