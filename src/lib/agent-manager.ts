import { spawn, type ChildProcess } from "child_process";
import { buildSystemPrompt } from "./context";
import { getCachedData } from "./datasources/manager";
import { buildPromptPrelude } from "./prompt-prelude";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
import { PROVIDERS, getProviderDefs, type ProviderDef } from "./provider-registry";
import { buildAgentEnv } from "./agent-env";
import { startEventServer, getEventServerInfo, onAgentEvent, removeAgentListeners } from "./agent-event-server";
import { setupClaudeHooks, cleanupClaudeHooks } from "./claude-hooks";

// ─── Re-exports for backwards compat ────────────────────────────────

export type AgentBackend = string;
export type AgentRole = "general" | "research" | "writer" | "ops";

export { getProviderDefs as getBackendDefs };
export type { ProviderDef };
export type BackendModel = { id: string; label: string };

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

// Suppresses redundant per-agent writes while restoring from disk
let restoring = false;

function savePersistedAgents() {
  if (restoring) return;
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

const ROLE_PROMPTS: Record<AgentRole, string> = {
  general: `You are a sharp AI co-pilot for a founder. Be concise, direct, and actionable.`,
  research: `You are a research analyst. Dig deep into topics, find evidence, compare options, and present findings clearly. Be thorough but structured.`,
  writer: `You are a writing assistant for a founder. Draft emails, memos, announcements, and docs. Match the founder's voice — direct, clear, no fluff.`,
  ops: `You are an operations assistant. Help with planning, scheduling, tracking, and process. Think in systems and checklists.`,
};

function getBaseContext() {
  // Use the latest datasource snapshot if one is cached (no fetch here —
  // warmAgent must stay synchronous). The 60s data poll keeps it warm.
  return buildSystemPrompt(getCachedData() ?? undefined);
}

interface AgentStateExt extends AgentState {
  customPrompt?: string | null;
  activeRequests?: number;
  hookDir?: string;
}

const agents = new Map<string, AgentStateExt>();

function genId(): string {
  return randomBytes(4).toString("hex");
}

function buildAgentSystemPrompt(role: AgentRole, customPrompt?: string | null): string {
  const rolePrompt = customPrompt || ROLE_PROMPTS[role];
  return `${rolePrompt}\n\n${getBaseContext()}`;
}

function getProviderOrThrow(backend: string): ProviderDef {
  const provider = PROVIDERS[backend];
  if (!provider) throw new Error(`Unknown backend: ${backend}`);
  return provider;
}

function spawnForBackend(
  backend: string,
  model: string,
  systemPrompt: string,
  extraEnv?: Record<string, string>,
  cwd?: string
): ChildProcess {
  const def = getProviderOrThrow(backend);
  const args = def.buildArgs(model, systemPrompt);

  const proc = spawn(def.binary, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: buildAgentEnv(extraEnv),
    cwd,
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error(`[agent:${backend}:stderr]`, chunk.toString());
  });

  return proc;
}

function warmAgent(state: AgentStateExt) {
  const { backend, model } = state.info;
  const def = getProviderOrThrow(backend);

  if (state.warmProc) {
    state.warmProc.kill();
    state.warmProc = null;
  }

  // Rebuild the prompt on every (re)warm so memory updates, new skills and
  // fresh datasource context reach the agent without an app restart.
  state.info.systemPrompt = buildAgentSystemPrompt(state.info.role, state.customPrompt);
  const systemPrompt = state.info.systemPrompt;

  if (def.supportsPrewarm) {
    // Set up hooks for Claude
    let cwd: string | undefined;
    const extraEnv: Record<string, string> = {};
    const eventInfo = getEventServerInfo();

    if (def.supportsHooks && eventInfo) {
      const hookDir = setupClaudeHooks({
        port: eventInfo.port,
        token: eventInfo.token,
        agentId: state.info.id,
      });
      state.hookDir = hookDir;
      cwd = hookDir;
      extraEnv.COCKPIT_HOOK_PORT = String(eventInfo.port);
      extraEnv.COCKPIT_HOOK_TOKEN = eventInfo.token;
      extraEnv.COCKPIT_AGENT_ID = state.info.id;
    }

    const proc = spawnForBackend(backend, model, systemPrompt, extraEnv, cwd);
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
  id?: string,
  opts?: { prewarm?: boolean }
): AgentInfo {
  const agentId = id || genId();
  const def = getProviderOrThrow(backend);
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

  // Listen for hook events from this agent
  onAgentEvent(agentId, (event) => {
    if (event.type === "stop") {
      state.info.busy = false;
    }
  });

  const proc = opts?.prewarm === false ? null : warmAgent(state);
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

/**
 * The agent used when no specific agent is addressed (e.g. focus-view
 * chat). First created agent, or a fresh default if none exist yet.
 */
export function getDefaultAgent(): AgentInfo {
  const first = agents.values().next();
  if (!first.done) return first.value.info;
  return createAgent("Pilot", "general");
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

  if (updates.backend && !updates.model) {
    const def = getProviderOrThrow(updates.backend);
    state.info.model = def.defaultModel;
  }

  if (needsRespawn) {
    state.info.systemPrompt = buildAgentSystemPrompt(state.info.role, state.customPrompt);
    cleanupClaudeHooks(id);
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
  cleanupClaudeHooks(id);
  removeAgentListeners(id);
  agents.delete(id);
  console.log("[agent-manager] deleted agent %s", id);
  savePersistedAgents();
  return true;
}

function writeImageToTemp(dataUrl: string): string {
  const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  const buffer = Buffer.from(match[2], "base64");
  const filePath = join(tmpdir(), `cockpit-img-${randomBytes(6).toString("hex")}.${ext}`);
  writeFileSync(filePath, buffer);
  return filePath;
}

export function sendToAgent(
  id: string,
  message: string,
  focusContext?: string,
  images?: string[]
): ChildProcess {
  const state = agents.get(id);
  if (!state) throw new Error(`Agent ${id} not found`);

  const { backend, model, systemPrompt } = state.info;
  const def = getProviderOrThrow(backend);
  const hasImages = images && images.length > 0;
  const tempImagePaths: string[] = [];

  let proc: ChildProcess;

  const extraEnv: Record<string, string> = {};
  const eventInfo = getEventServerInfo();
  if (eventInfo) {
    extraEnv.COCKPIT_HOOK_PORT = String(eventInfo.port);
    extraEnv.COCKPIT_HOOK_TOKEN = eventInfo.token;
    extraEnv.COCKPIT_AGENT_ID = id;
  }

  if (hasImages && backend === "claude") {
    for (const img of images) {
      try {
        tempImagePaths.push(writeImageToTemp(img));
      } catch (err) {
        console.error("[agent-manager] failed to write image:", err);
      }
    }

    const args = def.buildArgs(model, systemPrompt, { images: tempImagePaths });
    let cwd: string | undefined;
    if (def.supportsHooks && eventInfo) {
      const hookDir = setupClaudeHooks({
        port: eventInfo.port,
        token: eventInfo.token,
        agentId: id,
      });
      cwd = hookDir;
    }

    proc = spawn(def.binary, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildAgentEnv(extraEnv),
      cwd,
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[agent:${backend}:stderr]`, chunk.toString());
    });

    console.log("[agent-manager] spawned with %d images for %s", tempImagePaths.length, id);
  } else if (state.warmProc && state.warmProc.stdin?.writable) {
    proc = state.warmProc;
    state.warmProc = null;
    console.log("[agent-manager] using warm process for %s (pid %d)", id, proc.pid);
  } else {
    console.log("[agent-manager] cold start for %s (backend=%s)", id, backend);

    let cwd: string | undefined;
    if (def.supportsHooks && eventInfo) {
      const hookDir = setupClaudeHooks({
        port: eventInfo.port,
        token: eventInfo.token,
        agentId: id,
      });
      cwd = hookDir;
    }

    proc = spawnForBackend(backend, model, systemPrompt, extraEnv, cwd);
  }

  state.activeRequests = (state.activeRequests || 0) + 1;
  state.info.busy = true;

  // One-shot CLI calls have no session memory — carry recent turns and
  // relevant history along with the message.
  let prompt = buildPromptPrelude({ message, focusContext, agentId: id });
  if (hasImages && backend !== "claude") {
    prompt = `[${images!.length} image(s) attached]\n\n${prompt}`;
  }

  proc.stdin!.write(prompt);
  proc.stdin!.end();

  proc.on("close", () => {
    state.activeRequests = Math.max(0, (state.activeRequests || 1) - 1);
    state.info.busy = state.activeRequests > 0;

    for (const p of tempImagePaths) {
      try { unlinkSync(p); } catch { /* ignore */ }
    }

    if (agents.has(id) && def.supportsPrewarm && !state.warmProc) {
      warmAgent(state);
    }
  });

  return proc;
}

// ─── Boot ───────────────────────────────────────────────────────────

// Restore agents from disk. Only the first agent is pre-warmed: warming
// every restored agent would spawn N idle CLI processes at boot; the others
// warm up after their first message.
function restoreAgents() {
  const saved = loadPersistedAgents();
  if (saved.length === 0) {
    createAgent("Pilot", "general");
    return;
  }

  restoring = true;
  try {
    saved.forEach((a, i) => {
      createAgent(a.name, a.role, a.customPrompt, a.backend, a.model, a.id, {
        prewarm: i === 0,
      });
    });
  } finally {
    restoring = false;
  }
  console.log("[agent-manager] restored %d agents from disk", saved.length);
}

// Start the event server, then restore agents
startEventServer()
  .then(restoreAgents)
  .catch((err) => {
    console.error("[agent-manager] event server failed, booting without hooks:", err);
    restoreAgents();
  });
