/**
 * Observer Module — Knowledge Extraction from Conversations
 *
 * Inspired by ASMR's "Parallel Orchestration & Ingestion (Observer Agents)".
 * Instead of chunking and embedding, we use the LLM itself to extract
 * structured knowledge across six categories:
 *   Personal, Projects, Decisions, People, Preferences, Temporal, Knowledge
 *
 * The observer runs after each conversation, extracting facts the user
 * revealed — things that should be remembered for future conversations.
 */

import { spawn } from "child_process";
import type { SessionForExtraction, ExtractedMemory, MemoryCategory } from "./types";
import { addMemories, getMemoriesAsText } from "./store";

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

const OBSERVER_PROMPT = `You are a memory extraction agent. Your job is to read a conversation and extract facts worth remembering about the user for future conversations.

Extract knowledge into these categories:
- personal: Name, role, background, habits, communication style
- projects: Active projects, goals, priorities, current status, blockers
- decisions: Decisions made, rationale, trade-offs discussed
- people: Names mentioned, relationships, roles, preferences about people
- preferences: Tool preferences, workflow patterns, likes/dislikes, opinions
- temporal: Deadlines, schedules, commitments, time-bound facts
- knowledge: Domain expertise revealed, technical knowledge, learned facts

IMPORTANT RULES:
1. Only extract FACTS about the user — not the assistant's suggestions
2. Be specific — "user prefers Tailwind over styled-components" not "user has CSS preferences"
3. If the user corrects or updates a previous fact, mark it with supersedes_content containing the old fact
4. Skip small talk and generic questions — only extract durable, useful knowledge
5. Rate confidence 0-1 based on how explicit and clear the fact is
6. Extract tags for easy future retrieval

EXISTING MEMORIES (check for updates/contradictions):
{EXISTING_MEMORIES}

CONVERSATION TO ANALYZE:
{CONVERSATION}

Respond with ONLY a JSON array of extracted memories. If nothing worth remembering, respond with [].
Format:
[
  {
    "category": "personal|projects|decisions|people|preferences|temporal|knowledge",
    "content": "the extracted fact",
    "context": "brief context about when this came up",
    "confidence": 0.9,
    "tags": ["tag1", "tag2"],
    "supersedes_content": "old fact this replaces, if any"
  }
]`;

/**
 * Run the observer on a completed conversation to extract memories.
 * Uses Claude CLI (same transport as the rest of Cockpit).
 */
export async function extractMemories(
  session: SessionForExtraction
): Promise<ExtractedMemory[]> {
  // Skip very short conversations (< 2 turns)
  if (session.turns.length < 2) return [];

  // Format conversation for the observer
  const conversationText = session.turns
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  // Limit conversation size to avoid overwhelming the observer
  const trimmed = conversationText.slice(0, 8000);

  // Get existing memories for contradiction detection
  const existingMemories = getMemoriesAsText();

  const prompt = OBSERVER_PROMPT
    .replace("{EXISTING_MEMORIES}", existingMemories || "(none yet)")
    .replace("{CONVERSATION}", trimmed);

  try {
    const output = await runClaude(prompt);
    const parsed = parseExtraction(output);

    if (parsed.length > 0) {
      addMemories(parsed, session.sessionId);
      console.log(
        "[memory:observer] extracted %d memories from session %s",
        parsed.length,
        session.sessionId
      );
    }

    return parsed;
  } catch (err) {
    console.error("[memory:observer] extraction failed:", err);
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

    proc.on("error", (err) => {
      reject(err);
    });

    proc.stdin!.write(prompt);
    proc.stdin!.end();
  });
}

function parseExtraction(output: string): ExtractedMemory[] {
  try {
    // Try to find JSON array in the output (handle markdown code blocks)
    let jsonStr = output;

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];

    const validCategories: MemoryCategory[] = [
      "personal", "projects", "decisions", "people",
      "preferences", "temporal", "knowledge",
    ];

    return parsed
      .filter(
        (m: any) =>
          m.category &&
          validCategories.includes(m.category) &&
          m.content &&
          typeof m.content === "string"
      )
      .map((m: any) => ({
        category: m.category as MemoryCategory,
        content: m.content,
        context: m.context || "",
        confidence: typeof m.confidence === "number" ? m.confidence : 0.5,
        tags: Array.isArray(m.tags) ? m.tags : [],
        supersedes_content: m.supersedes_content || undefined,
      }));
  } catch {
    console.error("[memory:observer] failed to parse extraction output");
    return [];
  }
}
