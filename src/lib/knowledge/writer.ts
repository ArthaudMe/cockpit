/**
 * History writer — persists datasource items to ~/.cockpit/history/{YYYY-MM-DD}/{source}.json
 *
 * Each source file is a JSON array of items for that day.
 * Items are deduplicated by a stable ID derived from the source type.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  readdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes, createHash } from "crypto";
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

// Throttle writes to once every 5 minutes — no need to persist on every poll
let _lastWriteTime = 0;
const WRITE_THROTTLE = 5 * 60 * 1000;

/** Delete history day-dirs older than this many days on each write pass */
const RETENTION_DAYS = 90;

/** Hard cap on items kept per source file per day (keeps the freshest) */
const MAX_ITEMS_PER_DAY_FILE = 2000;

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
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

/** Atomic write: write to a temp file, then rename into place. Mirrors
 * memory/store.ts so a crash mid-write can't truncate an existing day file. */
function writeJsonArray(filePath: string, data: unknown[]) {
  const tmp = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, filePath);
}

/** Stable content hash for items lacking a source-provided id/timestamp. */
function hashContent(...parts: unknown[]): string {
  return createHash("sha256")
    .update(parts.map((p) => JSON.stringify(p ?? "")).join("|"))
    .digest("hex")
    .slice(0, 16);
}

function mergeById(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
  idFn: (item: Record<string, unknown>) => string
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  const order: string[] = [];

  const put = (item: Record<string, unknown>) => {
    const id = idFn(item);
    if (!byId.has(id)) order.push(id);
    // Incoming items are processed last, so the fresher copy wins on conflict.
    byId.set(id, item);
  };

  for (const item of existing) put(item);
  for (const item of incoming) put(item);

  return order.map((id) => byId.get(id)!);
}

function persistSource(
  dateDir: string,
  source: string,
  items: Record<string, unknown>[],
  idFn: (item: Record<string, unknown>) => string
) {
  const filePath = join(dateDir, `${source}.json`);
  const existing = readJsonArray(filePath) as Record<string, unknown>[];
  let merged = mergeById(existing, items, idFn);
  // Cap growth: keep the freshest items (newest are appended last).
  if (merged.length > MAX_ITEMS_PER_DAY_FILE) {
    merged = merged.slice(merged.length - MAX_ITEMS_PER_DAY_FILE);
  }
  writeJsonArray(filePath, merged);
}

/** Delete history day-dirs older than RETENTION_DAYS. */
function sweepRetention() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  let dirs: string[];
  try {
    dirs = readdirSync(HISTORY_DIR);
  } catch {
    return;
  }

  for (const d of dirs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (d >= cutoffStr) continue;
    try {
      rmSync(join(HISTORY_DIR, d), { recursive: true, force: true });
    } catch {
      // best-effort — a failed sweep must not break writes
    }
  }
}

// ─── Stable ID functions per source type ───────────────────────────

function calendarId(item: Record<string, unknown>): string {
  const e = item as unknown as CalendarEvent;
  return `${e.title}|${e.date}|${e.time}`;
}

function slackId(item: Record<string, unknown>): string {
  const e = item as unknown as SlackMessage;
  // Never key on `e.time` — it's a relative string ("2h ago") that changes
  // every poll, causing the same message to re-accumulate.
  if (e.id) return e.id;
  if (e.timestamp) return `slack|${e.timestamp}|${e.author}`;
  return hashContent("slack", e.channel, e.author, e.message);
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
  // GranolaMeeting carries no stable id/timestamp and `e.time` is relative,
  // so key on stable identifying content (title + attendees) instead.
  return hashContent("granola", e.title, e.attendees);
}

// ─── Public API ─────────────────────────────────────────────────────

export function writeHistory(data: DatasourceData): void {
  // Throttle: skip if written recently
  const now = Date.now();
  if (now - _lastWriteTime < WRITE_THROTTLE) return;
  _lastWriteTime = now;

  try {
    const dateStr = today();
    const dateDir = join(HISTORY_DIR, dateStr);
    ensureDir(dateDir);

    // Lazy retention sweep — piggybacks on the throttled write pass.
    sweepRetention();

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
