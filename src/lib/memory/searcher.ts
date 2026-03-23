/**
 * Searcher Module — Agentic Memory Retrieval
 *
 * Inspired by ASMR's "Active Agentic Retrieval (Search Agents)".
 * Instead of vector similarity search, we use parallel search agents
 * that actively read and reason over stored memories.
 *
 * Three search strategies run in parallel:
 *   1. Direct fact search — explicit matches
 *   2. Contextual search — related context, implications
 *   3. Temporal search — timeline reconstruction, recency
 *
 * Results are merged and deduplicated by an orchestrator.
 */

import { spawn } from "child_process";
import type { Memory, MemorySearchRequest, MemorySearchResult } from "./types";
import { getActiveMemories, getMemoriesAsText } from "./store";

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

// ─── Search Agent Prompts ───────────────────────────────────────────

const DIRECT_SEARCH_PROMPT = `You are a memory search agent focused on DIRECT FACTS.
Given a query, find memories that directly answer or relate to it.
Look for explicit statements, specific facts, and literal matches.

MEMORIES:
{MEMORIES}

QUERY: {QUERY}

Return a JSON array of relevant memory IDs with relevance and reasoning.
Format: [{"id": "mem_xxx", "relevance": "high|medium|low", "reasoning": "why this is relevant"}]
If nothing relevant, return [].`;

const CONTEXT_SEARCH_PROMPT = `You are a memory search agent focused on CONTEXT and IMPLICATIONS.
Given a query, find memories that provide useful background context — even if not directly about the query.
Look for related projects, people involved, preferences that apply, and social/professional context.

MEMORIES:
{MEMORIES}

QUERY: {QUERY}

Return a JSON array of relevant memory IDs with relevance and reasoning.
Format: [{"id": "mem_xxx", "relevance": "high|medium|low", "reasoning": "why this is relevant"}]
If nothing relevant, return [].`;

const TEMPORAL_SEARCH_PROMPT = `You are a memory search agent focused on TIME and UPDATES.
Given a query, find memories where timing matters — recent changes, deadlines, schedules, and facts that may have been updated over time.
Prefer the MOST RECENT version of any fact. Flag stale information.

MEMORIES:
{MEMORIES}

QUERY: {QUERY}

Return a JSON array of relevant memory IDs with relevance and reasoning.
Format: [{"id": "mem_xxx", "relevance": "high|medium|low", "reasoning": "why this is relevant"}]
If nothing relevant, return [].`;

// ─── Search Execution ───────────────────────────────────────────────

interface SearchAgentResult {
  id: string;
  relevance: "high" | "medium" | "low";
  reasoning: string;
}

async function runSearchAgent(
  prompt: string,
  memories: string,
  query: string
): Promise<SearchAgentResult[]> {
  const fullPrompt = prompt
    .replace("{MEMORIES}", memories)
    .replace("{QUERY}", query);

  try {
    const output = await runClaude(fullPrompt);
    return parseSearchResults(output);
  } catch (err) {
    console.error("[memory:searcher] agent failed:", err);
    return [];
  }
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      ["-p", "--output-format", "text", "--model", "claude-haiku-4-5-20251001"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: cleanEnv(),
      }
    );

    let output = "";
    let stderr = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      } else {
        resolve(output.trim());
      }
    });

    proc.on("error", reject);

    proc.stdin!.write(prompt);
    proc.stdin!.end();
  });
}

function parseSearchResults(output: string): SearchAgentResult[] {
  try {
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((r: any) => r.id && r.relevance)
      .map((r: any) => ({
        id: r.id,
        relevance: r.relevance as "high" | "medium" | "low",
        reasoning: r.reasoning || "",
      }));
  } catch {
    return [];
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────

/**
 * Run all three search agents in parallel, merge and deduplicate results.
 * This is the ASMR approach — active agentic retrieval instead of vector math.
 */
export async function searchMemories(
  request: MemorySearchRequest
): Promise<MemorySearchResult[]> {
  const allMemories = getActiveMemories();
  if (allMemories.length === 0) return [];

  // Filter by requested categories if specified
  let filtered = allMemories;
  if (request.categories?.length) {
    filtered = allMemories.filter((m) => request.categories!.includes(m.category));
  }

  if (filtered.length === 0) return [];

  const memoriesText = getMemoriesAsText();

  // Run 3 search agents in parallel (ASMR pattern)
  const [directResults, contextResults, temporalResults] = await Promise.all([
    runSearchAgent(DIRECT_SEARCH_PROMPT, memoriesText, request.query),
    runSearchAgent(CONTEXT_SEARCH_PROMPT, memoriesText, request.query),
    runSearchAgent(TEMPORAL_SEARCH_PROMPT, memoriesText, request.query),
  ]);

  // Merge and deduplicate — highest relevance wins
  const relevanceScore = { high: 3, medium: 2, low: 1 };
  const merged = new Map<string, { relevance: "high" | "medium" | "low"; reasoning: string; score: number }>();

  for (const results of [directResults, contextResults, temporalResults]) {
    for (const r of results) {
      const existing = merged.get(r.id);
      const score = relevanceScore[r.relevance];
      if (!existing || score > existing.score) {
        merged.set(r.id, { relevance: r.relevance, reasoning: r.reasoning, score });
      }
    }
  }

  // Build results with actual Memory objects
  const memoryMap = new Map(allMemories.map((m) => [m.id, m]));
  const results: MemorySearchResult[] = [];

  for (const [id, { relevance, reasoning }] of merged) {
    const memory = memoryMap.get(id);
    if (memory) {
      results.push({ memory, relevance, reasoning });
    }
  }

  // Sort: high > medium > low, then by recency
  results.sort((a, b) => {
    const scoreDiff = relevanceScore[b.relevance] - relevanceScore[a.relevance];
    if (scoreDiff !== 0) return scoreDiff;
    return b.memory.updatedAt - a.memory.updatedAt;
  });

  // Limit results
  const limit = request.limit || 10;
  return results.slice(0, limit);
}

/**
 * Fast, non-agentic search — keyword matching for system prompt injection.
 * Used when we need memories but can't afford the latency of 3 parallel agents.
 * Falls back to simple text matching instead of LLM reasoning.
 */
export function searchMemoriesFast(
  query: string,
  limit: number = 10
): Memory[] {
  const active = getActiveMemories();
  if (active.length === 0) return [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  // Score each memory by keyword overlap
  const scored = active.map((m) => {
    const text = `${m.content} ${m.tags.join(" ")} ${m.context}`.toLowerCase();
    let score = 0;
    for (const word of queryWords) {
      if (text.includes(word)) score += 1;
    }
    // Boost recent memories only if they have keyword matches
    if (score > 0) {
      const ageHours = (Date.now() - m.updatedAt) / (1000 * 60 * 60);
      if (ageHours < 24) score += 0.5;
      if (ageHours < 1) score += 0.5;
    }

    return { memory: m, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.memory);
}
