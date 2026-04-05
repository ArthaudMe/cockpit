/**
 * Conversation writer — persists chat messages to ~/.cockpit/history/{today}/conversations.json
 *
 * Deduplicates by hashing role + content + timestamp.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

const HISTORY_DIR = join(homedir(), ".cockpit", "history");

interface ConversationMessage {
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

function hashMessage(msg: ConversationMessage): string {
  return createHash("sha256")
    .update(`${msg.role}|${msg.content}|${msg.timestamp}`)
    .digest("hex")
    .slice(0, 16);
}

export function persistMessage(message: ConversationMessage): void {
  try {
    const dateDir = join(HISTORY_DIR, today());
    mkdirSync(dateDir, { recursive: true });

    const filePath = join(dateDir, "conversations.json");

    let existing: StoredMessage[] = [];
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          existing = parsed;
        }
      }
    } catch {
      existing = [];
    }

    const hash = hashMessage(message);

    // Dedup: skip if we already have this exact message
    if (existing.some((m) => m._hash === hash)) {
      return;
    }

    existing.push({ ...message, _hash: hash });
    writeFileSync(filePath, JSON.stringify(existing, null, 2));
  } catch (err) {
    console.error("[knowledge/conversations] failed to persist message:", err);
  }
}
