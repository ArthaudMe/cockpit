import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
} from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

// ─── Constants ──────────────────────────────────────────────────────

const MEMORIES_DIR = join(homedir(), ".cockpit", "memories");
const DELIMITER = "§";

/** Max characters per file (Hermes defaults) */
const LIMITS = {
  memory: 2200,
  user: 1375,
} as const;

/** Patterns that suggest prompt injection or data exfiltration */
const DANGEROUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(all\s+)?prior/i,
  /system\s*prompt/i,
  /\bAPIKEY\b/i,
  /\bpassword\b/i,
  /\bsecret\b/i,
  /https?:\/\/[^\s]*\.(ru|cn|tk|pw)\b/i,
  /<script\b/i,
  /data:text\/html/i,
];

// ─── Types ──────────────────────────────────────────────────────────

export type MemoryTarget = "memory" | "user";
export type MemoryAction = "add" | "replace" | "remove";

export interface MemoryCommand {
  action: MemoryAction;
  target: MemoryTarget;
  content?: string;
  old_text?: string;
}

// ─── Store ──────────────────────────────────────────────────────────

export class MemoryStore {
  private memory: string[] = [];
  private user: string[] = [];

  constructor() {
    this.loadFromDisk();
  }

  // ── Disk I/O ────────────────────────────────────────────────────

  private filePath(target: MemoryTarget): string {
    return join(MEMORIES_DIR, target === "memory" ? "MEMORY.md" : "USER.md");
  }

  private parseFile(content: string): string[] {
    return content
      .split(DELIMITER)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  private serializeEntries(entries: string[]): string {
    if (entries.length === 0) return "";
    return entries.map((e) => `${DELIMITER} ${e}`).join("\n");
  }

  /**
   * Strip the reserved delimiter from stored content. The delimiter is how
   * entries are separated on disk, so an entry containing it would fragment
   * permanently on the next parseFile(). Replacing it with a space keeps the
   * write→parseFile round-trip stable.
   */
  private sanitize(content: string): string {
    return content.split(DELIMITER).join(" ").replace(/\s+/g, " ").trim();
  }

  /**
   * Locate the entry targeted by `oldText`. Prefers an exact (trimmed,
   * case-insensitive) full-entry match; otherwise falls back to a unique
   * substring match. Returns an ambiguous error when a substring matches
   * more than one entry, rather than silently mutating the wrong one.
   */
  private findEntryIndex(
    entries: string[],
    oldText: string
  ): { idx: number; error?: string } {
    const needle = oldText.trim().toLowerCase();

    const exact = entries.findIndex((e) => e.trim().toLowerCase() === needle);
    if (exact !== -1) return { idx: exact };

    const substringMatches: number[] = [];
    entries.forEach((e, i) => {
      if (e.toLowerCase().includes(needle)) substringMatches.push(i);
    });

    if (substringMatches.length === 1) return { idx: substringMatches[0] };
    if (substringMatches.length > 1) {
      return {
        idx: -1,
        error: `"${oldText}" is ambiguous — it matches ${substringMatches.length} entries. Use the exact entry text.`,
      };
    }
    return { idx: -1, error: `No entry matching "${oldText}" found` };
  }

  private loadFromDisk() {
    mkdirSync(MEMORIES_DIR, { recursive: true, mode: 0o700 });

    for (const target of ["memory", "user"] as const) {
      const p = this.filePath(target);
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, "utf-8");
          this[target] = this.parseFile(raw);
        } catch {
          this[target] = [];
        }
      }
    }
  }

  /** Atomic write: write to temp, rename into place */
  private writeToDisk(target: MemoryTarget) {
    const p = this.filePath(target);
    mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
    const tmp = `${p}.${randomBytes(4).toString("hex")}.tmp`;
    const data = this.serializeEntries(this[target]);
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, p);
  }

  // ── Content Scanning ────────────────────────────────────────────

  private scanContent(text: string): boolean {
    return DANGEROUS_PATTERNS.some((p) => p.test(text));
  }

  /**
   * Record a failure so it can be surfaced even when the calling console
   * stream is already closed, then return the error result.
   */
  private fail(error: string): { ok: false; error: string } {
    _lastMemoryError = error;
    return { ok: false, error };
  }

  // ── Actions ─────────────────────────────────────────────────────

  add(target: MemoryTarget, content: string): { ok: boolean; error?: string } {
    if (!content?.trim()) return this.fail("Empty content");
    if (this.scanContent(content))
      return this.fail("Content flagged as potentially unsafe");

    const entries = this[target];
    const limit = LIMITS[target];
    const clean = this.sanitize(content);
    if (!clean) return this.fail("Empty content");

    // Dedup: skip if already exists
    if (entries.some((e) => e === clean)) {
      return { ok: true }; // Silently succeed
    }

    // Check capacity
    const current = this.serializeEntries(entries).length;
    const newLen = current + DELIMITER.length + 1 + clean.length + 1;
    if (newLen > limit) {
      return this.fail(
        `Would exceed ${target} limit (${limit} chars). Current: ${current}. Try replacing or removing an old entry first.`
      );
    }

    entries.push(clean);
    this.writeToDisk(target);
    return { ok: true };
  }

  replace(
    target: MemoryTarget,
    oldText: string,
    content: string
  ): { ok: boolean; error?: string } {
    if (!oldText?.trim()) return this.fail("Missing old_text");
    if (!content?.trim()) return this.fail("Empty content");
    if (this.scanContent(content))
      return this.fail("Content flagged as potentially unsafe");

    const clean = this.sanitize(content);
    if (!clean) return this.fail("Empty content");

    const entries = this[target];
    const { idx, error } = this.findEntryIndex(entries, oldText);
    if (idx === -1) return this.fail(error!);

    entries[idx] = clean;
    this.writeToDisk(target);
    return { ok: true };
  }

  remove(
    target: MemoryTarget,
    oldText: string
  ): { ok: boolean; error?: string } {
    if (!oldText?.trim()) return this.fail("Missing old_text");

    const entries = this[target];
    const { idx, error } = this.findEntryIndex(entries, oldText);
    if (idx === -1) return this.fail(error!);

    entries.splice(idx, 1);
    this.writeToDisk(target);
    return { ok: true };
  }

  // ── Read ────────────────────────────────────────────────────────

  getEntries(target: MemoryTarget): string[] {
    return [...this[target]];
  }

  /** Current entries formatted for system prompt injection */
  formatForSystemPrompt(): string {
    const memBlock =
      this.memory.length > 0
        ? this.memory.map((e) => `${DELIMITER} ${e}`).join("\n")
        : "(empty)";
    const userBlock =
      this.user.length > 0
        ? this.user.map((e) => `${DELIMITER} ${e}`).join("\n")
        : "(empty)";

    return `## Your Memory

You have persistent memory across conversations. Use it to remember important context about the user and their work.

### Notes (MEMORY.md)
${memBlock}

### User Profile (USER.md)
${userBlock}

### Memory Commands
To manage your memory, include a JSON code block in your response:

\`\`\`json
{
  "cockpit_memory": true,
  "action": "add",
  "target": "memory",
  "content": "New entry to remember"
}
\`\`\`

Actions:
- **add**: Add a new entry. Requires \`content\`.
- **replace**: Update an existing entry. Requires \`old_text\` (substring match) and \`content\`.
- **remove**: Delete an entry. Requires \`old_text\` (substring match).

Targets: \`memory\` (your working notes) or \`user\` (user profile facts).

Guidelines:
- Proactively save important facts, preferences, decisions, and context
- Keep entries concise — one fact per entry
- Update stale entries with \`replace\` rather than adding duplicates
- Remove entries that are no longer relevant
- The user profile should contain stable facts (name, role, company, preferences)
- Notes should contain working context (project state, decisions, blockers)
- Memory commands are processed silently — don't mention them to the user`;
  }
}

// ─── Failure surfacing ──────────────────────────────────────────────

let _lastMemoryError: string | null = null;

/**
 * The last memory operation failure recorded by the store, or null if the
 * last op succeeded / none has failed. Lets callers surface failures that
 * would otherwise vanish into a closed console stream.
 */
export function getLastMemoryError(): string | null {
  return _lastMemoryError;
}

// ─── Singleton ──────────────────────────────────────────────────────

let _store: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!_store) {
    _store = new MemoryStore();
  }
  return _store;
}

/** Force reload from disk (e.g. after external changes) */
export function resetMemoryStore() {
  _store = null;
}
