/**
 * Memory System — Main API
 *
 * ASMR-inspired: Agentic Search and Memory Retrieval
 * No vector DB. No embeddings. Pure agentic extraction + retrieval.
 */

export type {
  Memory,
  MemoryCategory,
  MemoryStats,
  MemorySearchRequest,
  MemorySearchResult,
  ExtractedMemory,
  ConversationTurn,
  SessionForExtraction,
} from "./types";

export {
  getAllMemories,
  getActiveMemories,
  getMemoriesByCategory,
  addMemory,
  addMemories,
  deleteMemory,
  clearAllMemories,
  getMemoryStats,
  getMemoriesAsText,
} from "./store";

export { extractMemories } from "./observer";
export { searchMemories, searchMemoriesFast } from "./searcher";

import { getActiveMemories } from "./store";
import { searchMemoriesFast } from "./searcher";
import type { Memory } from "./types";

/**
 * Build a memory context section for injection into the system prompt.
 * Uses fast keyword search (no LLM calls) to keep latency low.
 */
export function buildMemoryPromptSection(userMessage?: string): string {
  const active = getActiveMemories();

  if (active.length === 0) return "";

  // If we have a user message, do fast keyword retrieval
  if (userMessage) {
    const relevant = searchMemoriesFast(userMessage, 8);
    if (relevant.length === 0) {
      // Fall back to most recent memories
      return formatMemoriesSection(active.slice(-5));
    }
    return formatMemoriesSection(relevant);
  }

  // No query — include most recent memories as general context
  return formatMemoriesSection(active.slice(-8));
}

function formatMemoriesSection(memories: Memory[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => `- (${m.category}) ${m.content}`);

  return `\n\n## What You Remember About the User
${lines.join("\n")}`;
}
