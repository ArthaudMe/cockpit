/**
 * ASMR-inspired Memory System Types
 *
 * Agentic Search and Memory Retrieval — no vector DB, no embeddings.
 * Structured knowledge extraction + agentic search over stored findings.
 */

// ─── Knowledge Categories (Observer extraction vectors) ─────────────

export type MemoryCategory =
  | "personal"      // Name, role, preferences, habits, communication style
  | "projects"      // Active projects, goals, priorities, status
  | "decisions"     // Decisions made, rationale, trade-offs
  | "people"        // Contacts, relationships, preferences about people
  | "preferences"   // Tool preferences, workflow patterns, likes/dislikes
  | "temporal"      // Time-bound facts: deadlines, schedules, commitments
  | "knowledge";    // Domain expertise, learned facts, domain context

// ─── Core Memory Unit ───────────────────────────────────────────────

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;           // The extracted knowledge
  context: string;           // Brief context about when/how this was learned
  sourceSession: string;     // Agent or session ID that produced this
  createdAt: number;         // Unix timestamp
  updatedAt: number;         // Last update (for superseding old facts)
  confidence: number;        // 0-1 how confident the extraction was
  supersedes?: string;       // ID of memory this replaces (temporal updates)
  tags: string[];            // Searchable tags extracted by observer
}

// ─── Session for Observer Processing ────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SessionForExtraction {
  sessionId: string;
  agentId: string;
  agentName: string;
  turns: ConversationTurn[];
  timestamp: number;
}

// ─── Observer Output ────────────────────────────────────────────────

export interface ExtractedMemory {
  category: MemoryCategory;
  content: string;
  context: string;
  confidence: number;
  tags: string[];
  supersedes_content?: string; // Content of a memory this should replace
}

// ─── Search Request & Result ────────────────────────────────────────

export interface MemorySearchRequest {
  query: string;
  categories?: MemoryCategory[];
  limit?: number;
}

export interface MemorySearchResult {
  memory: Memory;
  relevance: "high" | "medium" | "low";
  reasoning: string;
}

// ─── Memory Store Stats ─────────────────────────────────────────────

export interface MemoryStats {
  total: number;
  byCategory: Record<MemoryCategory, number>;
  oldestMemory: number | null;
  newestMemory: number | null;
}
