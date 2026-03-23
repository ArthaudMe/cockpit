/**
 * File-based memory store — no vector DB, no embeddings.
 *
 * All memories persisted as JSON in ~/.cockpit/memory/.
 * Simple, fast, embeddable — inspired by ASMR's "completely in-memory" approach.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import type { Memory, MemoryCategory, MemoryStats, ExtractedMemory } from "./types";

const COCKPIT_DIR = join(homedir(), ".cockpit");
const MEMORY_DIR = join(COCKPIT_DIR, "memory");
const MEMORIES_FILE = join(MEMORY_DIR, "memories.json");

// ─── In-memory cache ────────────────────────────────────────────────

let memories: Memory[] = [];
let loaded = false;

function ensureDir() {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

function load(): Memory[] {
  if (loaded) return memories;
  try {
    ensureDir();
    if (!existsSync(MEMORIES_FILE)) {
      memories = [];
      loaded = true;
      return memories;
    }
    const raw = readFileSync(MEMORIES_FILE, "utf-8");
    memories = JSON.parse(raw);
    loaded = true;
    return memories;
  } catch {
    memories = [];
    loaded = true;
    return memories;
  }
}

function persist() {
  try {
    ensureDir();
    writeFileSync(MEMORIES_FILE, JSON.stringify(memories, null, 2));
  } catch (err) {
    console.error("[memory-store] failed to persist:", err);
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function genMemoryId(): string {
  return "mem_" + randomBytes(6).toString("hex");
}

export function getAllMemories(): Memory[] {
  return load();
}

export function getMemoriesByCategory(category: MemoryCategory): Memory[] {
  return load().filter((m) => m.category === category);
}

export function getActiveMemories(): Memory[] {
  const all = load();
  // Exclude superseded memories (ones that have been replaced by newer facts)
  const supersededIds = new Set(
    all.filter((m) => m.supersedes).map((m) => m.supersedes!)
  );
  return all.filter((m) => !supersededIds.has(m.id));
}

export function addMemory(extracted: ExtractedMemory, sourceSession: string): Memory {
  load();

  // Check if this supersedes an existing memory
  let supersedesId: string | undefined;
  if (extracted.supersedes_content) {
    const existing = memories.find(
      (m) =>
        m.category === extracted.category &&
        m.content.toLowerCase().includes(extracted.supersedes_content!.toLowerCase().slice(0, 50))
    );
    if (existing) {
      supersedesId = existing.id;
    }
  }

  const memory: Memory = {
    id: genMemoryId(),
    category: extracted.category,
    content: extracted.content,
    context: extracted.context,
    sourceSession,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    confidence: extracted.confidence,
    supersedes: supersedesId,
    tags: extracted.tags,
  };

  memories.push(memory);
  persist();
  return memory;
}

export function addMemories(extracted: ExtractedMemory[], sourceSession: string): Memory[] {
  return extracted.map((e) => addMemory(e, sourceSession));
}

export function deleteMemory(id: string): boolean {
  load();
  const idx = memories.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  memories.splice(idx, 1);
  persist();
  return true;
}

export function clearAllMemories(): void {
  memories = [];
  loaded = true;
  persist();
}

export function getMemoryStats(): MemoryStats {
  const all = load();
  const byCategory = {} as Record<MemoryCategory, number>;
  const categories: MemoryCategory[] = [
    "personal", "projects", "decisions", "people",
    "preferences", "temporal", "knowledge",
  ];
  for (const c of categories) {
    byCategory[c] = all.filter((m) => m.category === c).length;
  }

  return {
    total: all.length,
    byCategory,
    oldestMemory: all.length > 0 ? Math.min(...all.map((m) => m.createdAt)) : null,
    newestMemory: all.length > 0 ? Math.max(...all.map((m) => m.createdAt)) : null,
  };
}

/**
 * Get all memories as a flat text for agentic search.
 * Each memory is formatted with its metadata for the search agent to reason over.
 */
export function getMemoriesAsText(): string {
  const active = getActiveMemories();
  if (active.length === 0) return "";

  return active
    .map((m) => {
      const date = new Date(m.createdAt).toISOString().split("T")[0];
      return `[${m.id}] (${m.category}) [${date}] ${m.content} — context: ${m.context} — tags: ${m.tags.join(", ")}`;
    })
    .join("\n");
}
