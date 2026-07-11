/**
 * Conversation writer — persists chat messages to ~/.cockpit/history/{today}/conversations.json
 *
 * Deduplicates by hashing role + content + timestamp. The current day is
 * kept in memory so each message append doesn't re-read and re-parse the
 * whole file; writes happen asynchronously off the response path.
 */

import { readFileSync, mkdirSync, existsSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import { readJsonCached } from "../fs-cache";

const HISTORY_DIR = join(homedir(), ".cockpit", "history");

/** Hard cap per day so a chatty day can't grow the file unboundedly */
const MAX_MESSAGES_PER_DAY = 2000;

export interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
  agentId?: string;
}

interface StoredMessage extends ConversationMessage {
  _hash: string;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function dayFilePath(date: string): string {
  return join(HISTORY_DIR, date, "conversations.json");
}

function hashMessage(msg: ConversationMessage): string {
  return createHash("sha256")
    .update(`${msg.role}|${msg.content}|${msg.timestamp}`)
    .digest("hex")
    .slice(0, 16);
}

function readDayFile(date: string): StoredMessage[] {
  try {
    const filePath = dayFilePath(date);
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── In-memory cache of the current day ─────────────────────────────

let dayCache: {
  date: string;
  messages: StoredMessage[];
  hashes: Set<string>;
} | null = null;

/** Serialize writes so concurrent appends never interleave */
let writeQueue: Promise<void> = Promise.resolve();

function loadDay(date: string) {
  if (dayCache && dayCache.date === date) return dayCache;
  const messages = readDayFile(date);
  dayCache = {
    date,
    messages,
    hashes: new Set(messages.map((m) => m._hash)),
  };
  return dayCache;
}

function scheduleWrite(date: string, messages: StoredMessage[]) {
  // Capture the target date + messages array in the closure. Re-checking the
  // mutable dayCache here would drop a 23:59 message whose write runs after
  // the day rolled over (dayCache.date no longer matches).
  writeQueue = writeQueue
    .then(() => {
      const dateDir = join(HISTORY_DIR, date);
      mkdirSync(dateDir, { recursive: true, mode: 0o700 });
      return writeFile(dayFilePath(date), JSON.stringify(messages, null, 2), {
        mode: 0o600,
      });
    })
    .catch((err) => {
      console.error("[knowledge/conversations] failed to persist:", err);
    });
}

// ─── Public API ─────────────────────────────────────────────────────

export function persistMessage(message: ConversationMessage): void {
  try {
    const date = today();
    const cache = loadDay(date);

    const hash = hashMessage(message);
    if (cache.hashes.has(hash)) return;

    cache.hashes.add(hash);
    cache.messages.push({ ...message, _hash: hash });
    if (cache.messages.length > MAX_MESSAGES_PER_DAY) {
      const dropped = cache.messages.splice(
        0,
        cache.messages.length - MAX_MESSAGES_PER_DAY
      );
      for (const m of dropped) cache.hashes.delete(m._hash);
    }

    scheduleWrite(date, cache.messages);
  } catch (err) {
    console.error("[knowledge/conversations] failed to persist message:", err);
  }
}

/**
 * Most recent messages for an agent (today + yesterday), oldest first.
 * Used to give one-shot CLI calls short-term conversational memory.
 */
export function getRecentMessages(
  agentId: string,
  limit: number
): ConversationMessage[] {
  const todayStr = today();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const todayMessages = loadDay(todayStr).messages;
  // Yesterday's file is immutable once the day rolls over, so serve it from
  // the mtime-keyed cache rather than re-reading/parsing it per message.
  const yesterdayCached = readJsonCached<StoredMessage[]>(
    dayFilePath(yesterday),
    []
  );
  const yesterdayMessages = Array.isArray(yesterdayCached)
    ? yesterdayCached
    : [];
  const all =
    todayMessages.length >= limit
      ? todayMessages
      : [...yesterdayMessages, ...todayMessages];

  const forAgent = all.filter((m) => m.agentId === agentId);
  return forAgent.slice(-limit).map(({ _hash, ...msg }) => msg);
}
