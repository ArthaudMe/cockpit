/**
 * History writer — persists datasource items to ~/.cockpit/history/{YYYY-MM-DD}/{source}.json
 *
 * Each source file is a JSON array of items for that day.
 * Items are deduplicated by a stable ID derived from the source type.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  DatasourceData,
  CalendarEvent,
  EmailThread,
  LinearIssue,
  GitHubPR,
  GitHubNotification,
  NotionPage,
  SlackMessage,
  GranolaMeeting,
} from "@/lib/datasources/types";

const HISTORY_DIR = join(homedir(), ".cockpit", "history");

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function readJsonArray(filePath: string): unknown[] {
  try {
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath: string, data: unknown[]) {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function mergeById(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
  idFn: (item: Record<string, unknown>) => string
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const result: Record<string, unknown>[] = [];

  // Add existing items first
  for (const item of existing) {
    const id = idFn(item);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    }
  }

  // Add new items, deduplicating
  for (const item of incoming) {
    const id = idFn(item);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(item);
    }
  }

  return result;
}

function persistSource(
  dateDir: string,
  source: string,
  items: Record<string, unknown>[],
  idFn: (item: Record<string, unknown>) => string
) {
  const filePath = join(dateDir, `${source}.json`);
  const existing = readJsonArray(filePath) as Record<string, unknown>[];
  const merged = mergeById(existing, items, idFn);
  writeJsonArray(filePath, merged);
}

// ─── Stable ID functions per source type ───────────────────────────

function calendarId(item: Record<string, unknown>): string {
  const e = item as unknown as CalendarEvent;
  return `${e.title}|${e.date}|${e.time}`;
}

function slackId(item: Record<string, unknown>): string {
  const e = item as unknown as SlackMessage;
  return `${e.channel}|${e.time}|${e.author}`;
}

function linearId(item: Record<string, unknown>): string {
  const e = item as unknown as LinearIssue;
  return e.id;
}

function githubPRId(item: Record<string, unknown>): string {
  const e = item as unknown as GitHubPR;
  return `${e.repo}|${e.title}`;
}

function githubNotifId(item: Record<string, unknown>): string {
  const e = item as unknown as GitHubNotification;
  return `${e.repo}|${e.title}|${e.type}`;
}

function notionId(item: Record<string, unknown>): string {
  const e = item as unknown as NotionPage;
  return e.url;
}

function emailId(item: Record<string, unknown>): string {
  const e = item as unknown as EmailThread;
  return `${e.from}|${e.subject}`;
}

function granolaId(item: Record<string, unknown>): string {
  const e = item as unknown as GranolaMeeting;
  return `${e.title}|${e.time}`;
}

// ─── Public API ─────────────────────────────────────────────────────

export function writeHistory(data: DatasourceData): void {
  try {
    const dateStr = today();
    const dateDir = join(HISTORY_DIR, dateStr);
    ensureDir(dateDir);

    if (data.calendar?.length) {
      persistSource(
        dateDir,
        "calendar",
        data.calendar as unknown as Record<string, unknown>[],
        calendarId
      );
    }

    if (data.slackMessages?.length) {
      persistSource(
        dateDir,
        "slack",
        data.slackMessages as unknown as Record<string, unknown>[],
        slackId
      );
    }

    if (data.linearIssues?.length) {
      persistSource(
        dateDir,
        "linear",
        data.linearIssues as unknown as Record<string, unknown>[],
        linearId
      );
    }

    if (data.githubPRs?.length) {
      persistSource(
        dateDir,
        "github",
        data.githubPRs as unknown as Record<string, unknown>[],
        githubPRId
      );
    }

    if (data.githubNotifications?.length) {
      persistSource(
        dateDir,
        "github-notifications",
        data.githubNotifications as unknown as Record<string, unknown>[],
        githubNotifId
      );
    }

    if (data.notionPages?.length) {
      persistSource(
        dateDir,
        "notion",
        data.notionPages as unknown as Record<string, unknown>[],
        notionId
      );
    }

    if (data.emails?.length) {
      persistSource(
        dateDir,
        "email",
        data.emails as unknown as Record<string, unknown>[],
        emailId
      );
    }

    if (data.granolaMeetings?.length) {
      persistSource(
        dateDir,
        "granola",
        data.granolaMeetings as unknown as Record<string, unknown>[],
        granolaId
      );
    }
  } catch (err) {
    console.error("[knowledge/writer] failed to write history:", err);
  }
}
