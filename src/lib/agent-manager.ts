import { spawn, type ChildProcess } from "child_process";
import { buildSystemPrompt } from "./context";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Backend Definitions ────────────────────────────────────────────

export type AgentBackend = "claude" | "codex" | "ollama";
export type AgentRole = "general" | "research" | "writer" | "ops";

export interface BackendModel {
  id: string;
  label: string;
}

interface BackendDef {
  label: string;
  binary: string;
  models: BackendModel[];
  defaultModel: string;
  buildArgs: (model: string, systemPrompt: string) => string[];
  supportsPrewarm: boolean;
}

const BACKENDS: Record<AgentBackend, BackendDef> = {
  claude: {
    label: "Claude",
    binary: "claude",
    models: [
      { id: "claude-sonnet-4-6", label: "Sonnet (fast)" },
      { id: "claude-opus-4-6", label: "Opus (smart)" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku (instant)" },
    ],
    defaultModel: "claude-sonnet-4-6",
    buildArgs: (model, systemPrompt) => [
      "-p",
      "--output-format", "text",
      "--model", model,
      "--append-system-prompt", systemPrompt,
    ],
    supportsPrewarm: true,
  },
  codex: {
    label: "Codex",
    binary: "codex",
    models: [
      { id: "o4-mini", label: "o4-mini (fast)" },
      { id: "o3", label: "o3 (smart)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
    defaultModel: "o4-mini",
    buildArgs: (model, systemPrompt) => [
      "-q",
      "--model", model,
      "--system-prompt", systemPrompt,
    ],
    supportsPrewarm: true,
  },
  ollama: {
    label: "Ollama",
    binary: "ollama",
    models: [
      { id: "llama3.3", label: "Llama 3.3" },
      { id: "qwen3", label: "Qwen 3" },
      { id: "deepseek-r1", label: "DeepSeek R1" },
      { id: "gemma3", label: "Gemma 3" },
    ],
    defaultModel: "llama3.3",
    buildArgs: (model, _systemPrompt) => ["run", model],
    supportsPrewarm: false,
  },
};

export function getBackendDefs() {
  return Object.entries(BACKENDS).map(([key, def]) => ({
    id: key as AgentBackend,
    label: def.label,
    models: def.models,
    defaultModel: def.defaultModel,
  }));
}

// ─── Agent Types ────────────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  backend: AgentBackend;
  model: string;
  systemPrompt: string;
  createdAt: number;
  busy: boolean;
}

interface AgentState {
  info: AgentInfo;
  warmProc: ChildProcess | null;
}

// ─── Persistence ────────────────────────────────────────────────────

interface PersistedAgent {
  id: string;
  name: string;
  role: AgentRole;
  backend: AgentBackend;
  model: string;
  customPrompt: string | null;
  createdAt: number;
}

const COCKPIT_DIR = join(homedir(), ".cockpit");
const AGENTS_FILE = join(COCKPIT_DIR, "agents.json");

function loadPersistedAgents(): PersistedAgent[] {
  try {
    if (!existsSync(AGENTS_FILE)) return [];
    const raw = readFileSync(AGENTS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return data.agents || [];
  } catch {
    return [];
  }
}

function savePersistedAgents() {
  const persisted: PersistedAgent[] = Array.from(agents.values()).map((s) => ({
    id: s.info.id,
    name: s.info.name,
    role: s.info.role,
    backend: s.info.backend,
    model: s.info.model,
    customPrompt: s.customPrompt ?? null,
    createdAt: s.info.createdAt,
  }));

  try {
    mkdirSync(COCKPIT_DIR, { recursive: true });
    writeFileSync(AGENTS_FILE, JSON.stringify({ agents: persisted }, null, 2));
  } catch (err) {
    console.error("[agent-manager] failed to save agents:", err);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

const ROLE_PROMPTS: Record<AgentRole, string> = {
  general: `You are a sharp AI co-pilot for a founder. Be concise, direct, and actionable.`,
  research: `You are a research analyst. Dig deep into topics, find evidence, compare options, and present findings clearly. Be thorough but structured.`,
  writer: `You are a writing assistant for a founder. Draft emails, memos, announcements, and docs. Match the founder's voice — direct, clear, no fluff.`,
  ops: `You are an operations assistant. Help with planning, scheduling, tracking, and process. Think in systems and checklists.`,
};

// Build fresh each time an agent is created so it picks up profile changes
function getBaseContext() {
  return buildSystemPrompt();
}

interface AgentStateExt extends AgentState {
  customPrompt?: string | null;
  activeRequests?: number;
}

const agents = new Map<string, AgentStateExt>();

function genId(): string {
  return randomBytes(4).toString("hex");
}

function buildAgentSystemPrompt(role: AgentRole, customPrompt?: string | null): string {
  const rolePrompt = customPrompt || ROLE_PROMPTS[role];
  return `${rolePrompt}\n\n${getBaseContext()}`;
}

function spawnForBackend(backend: AgentBackend, model: string, systemPrompt: string): ChildProcess {
  const def = BACKENDS[backend];
  const args = def.buildArgs(model, systemPrompt);

  const proc = spawn(def.binary, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv(),
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[agent:${backend}:stderr]`, chunk.toString());
  });

  return proc;
}

function warmAgent(state: AgentStateExt) {
  const { backend, model, systemPrompt } = state.info;
  const def = BACKENDS[backend];

  if (state.warmProc) {
    state.warmProc.kill();
    state.warmProc = null;
  }

  if (def.supportsPrewarm) {
    const proc = spawnForBackend(backend, model, systemPrompt);
    proc.on("error", () => {
      if (state.warmProc === proc) state.warmProc = null;
    });
    proc.on("exit", () => {
      if (state.warmProc === proc) state.warmProc = null;
    });
    state.warmProc = proc;
    return proc;
  }

  return null;
}

// ─── Public API ─────────────────────────────────────────────────────

export function createAgent(
  name: string,
  role: AgentRole = "general",
  customPrompt?: string | null,
  backend: AgentBackend = "claude",
  model?: string,
  id?: string
): AgentInfo {
  const agentId = id || genId();
  const def = BACKENDS[backend];
  const resolvedModel = model || def.defaultModel;
  const systemPrompt = buildAgentSystemPrompt(role, customPrompt);

  const info: AgentInfo = {
    id: agentId,
    name,
    role,
    backend,
    model: resolvedModel,
    systemPrompt,
    createdAt: Date.now(),
    busy: false,
  };

  const state: AgentStateExt = { info, warmProc: null, customPrompt: customPrompt ?? null };
  agents.set(agentId, state);

  const proc = warmAgent(state);
  if (proc) {
    console.log("[agent-manager] created agent %s (%s) backend=%s model=%s pid=%d", name, agentId, backend, resolvedModel, proc.pid);
  } else {
    console.log("[agent-manager] created agent %s (%s) backend=%s model=%s (no prewarm)", name, agentId, backend, resolvedModel);
  }

  savePersistedAgents();
  return info;
}

export function listAgents(): AgentInfo[] {
  return Array.from(agents.values()).map((s) => s.info);
}

export function getAgent(id: string): AgentInfo | null {
  return agents.get(id)?.info ?? null;
}

export function updateAgent(
  id: string,
  updates: { backend?: AgentBackend; model?: string; name?: string; role?: AgentRole }
): AgentInfo | null {
  const state = agents.get(id);
  if (!state) return null;

  const needsRespawn =
    (updates.backend && updates.backend !== state.info.backend) ||
    (updates.model && updates.model !== state.info.model) ||
    (updates.role && updates.role !== state.info.role);

  if (updates.name) state.info.name = updates.name;
  if (updates.role) {
    state.info.role = updates.role;
    state.info.systemPrompt = buildAgentSystemPrompt(updates.role, state.customPrompt);
  }
  if (updates.backend) state.info.backend = updates.backend;
  if (updates.model) state.info.model = updates.model;

  // If backend changed without a model, use the new backend's default
  if (updates.backend && !updates.model) {
    state.info.model = BACKENDS[updates.backend].defaultModel;
  }

  if (needsRespawn) {
    state.info.systemPrompt = buildAgentSystemPrompt(state.info.role, state.customPrompt);
    warmAgent(state);
    console.log("[agent-manager] re-warmed agent %s (backend=%s model=%s)", id, state.info.backend, state.info.model);
  }

  savePersistedAgents();
  return state.info;
}

export function deleteAgent(id: string): boolean {
  const state = agents.get(id);
  if (!state) return false;

  if (state.warmProc) {
    state.warmProc.kill();
  }
  agents.delete(id);
  console.log("[agent-manager] deleted agent %s", id);
  savePersistedAgents();
  return true;
}

export function sendToAgent(
  id: string,
  message: string,
  focusContext?: string
): ChildProcess {
  const state = agents.get(id);
  if (!state) throw new Error(`Agent ${id} not found`);

  const { backend, model, systemPrompt } = state.info;
  let proc: ChildProcess;

  if (state.warmProc && state.warmProc.stdin?.writable) {
    proc = state.warmProc;
    state.warmProc = null;
    console.log("[agent-manager] using warm process for %s (pid %d)", id, proc.pid);
  } else {
    console.log("[agent-manager] cold start for %s (backend=%s)", id, backend);
    proc = spawnForBackend(backend, model, systemPrompt);
  }

  state.activeRequests = (state.activeRequests || 0) + 1;
  state.info.busy = true;

  let prompt = message;
  if (focusContext) {
    prompt = `[Context:\n${focusContext}]\n\n${message}`;
  }

  proc.stdin!.write(prompt);
  proc.stdin!.end();

  const def = BACKENDS[backend];
  proc.on("close", () => {
    state.activeRequests = Math.max(0, (state.activeRequests || 1) - 1);
    state.info.busy = state.activeRequests > 0;
    // Pre-warm a fresh process for the next request
    if (agents.has(id) && def.supportsPrewarm && !state.warmProc) {
      warmAgent(state);
    }
  });

  return proc;
}

// ─── Boot: restore persisted agents or create default ───────────────

const saved = loadPersistedAgents();
if (saved.length > 0) {
  for (const a of saved) {
    createAgent(a.name, a.role, a.customPrompt, a.backend, a.model, a.id);
  }
  console.log("[agent-manager] restored %d agents from disk", saved.length);
} else {
  createAgent("Pilot", "general");
}
