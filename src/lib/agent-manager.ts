import { spawn, type ChildProcess } from "child_process";
import { getContext, buildSystemPrompt } from "./context";
import { randomBytes } from "crypto";

export type AgentRole = "general" | "research" | "writer" | "ops";

export interface AgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  createdAt: number;
  busy: boolean;
}

interface AgentState {
  info: AgentInfo;
  warmProc: ChildProcess | null;
}

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

const baseContext = buildSystemPrompt(getContext());

// ─── Agent Store ───────────────────────────────────────────────────
const agents = new Map<string, AgentState>();

function genId(): string {
  return randomBytes(4).toString("hex");
}

function buildAgentSystemPrompt(role: AgentRole, customPrompt?: string): string {
  const rolePrompt = customPrompt || ROLE_PROMPTS[role];
  return `${rolePrompt}\n\n${baseContext}`;
}

function spawnWarmForAgent(systemPrompt: string): ChildProcess {
  const proc = spawn(
    "claude",
    ["-p", "--output-format", "text", "--append-system-prompt", systemPrompt],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: cleanEnv(),
    }
  );

  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error("[agent:warm:stderr]", chunk.toString());
  });

  return proc;
}

// ─── Public API ────────────────────────────────────────────────────

export function createAgent(
  name: string,
  role: AgentRole = "general",
  customPrompt?: string
): AgentInfo {
  const id = genId();
  const systemPrompt = buildAgentSystemPrompt(role, customPrompt);

  const info: AgentInfo = {
    id,
    name,
    role,
    systemPrompt,
    createdAt: Date.now(),
    busy: false,
  };

  // Pre-warm a process for this agent
  const warmProc = spawnWarmForAgent(systemPrompt);
  console.log("[agent-manager] created agent %s (%s) pid=%d", name, id, warmProc.pid);

  warmProc.on("error", () => {
    const state = agents.get(id);
    if (state && state.warmProc === warmProc) state.warmProc = null;
  });

  warmProc.on("exit", () => {
    const state = agents.get(id);
    if (state && state.warmProc === warmProc) state.warmProc = null;
  });

  agents.set(id, { info, warmProc });
  return info;
}

export function listAgents(): AgentInfo[] {
  return Array.from(agents.values()).map((s) => s.info);
}

export function getAgent(id: string): AgentInfo | null {
  return agents.get(id)?.info ?? null;
}

export function deleteAgent(id: string): boolean {
  const state = agents.get(id);
  if (!state) return false;

  if (state.warmProc) {
    state.warmProc.kill();
  }
  agents.delete(id);
  console.log("[agent-manager] deleted agent %s", id);
  return true;
}

/**
 * Send a message to a specific agent. Returns the ChildProcess
 * whose stdout streams the response.
 */
export function sendToAgent(
  id: string,
  message: string,
  focusContext?: string
): ChildProcess {
  const state = agents.get(id);
  if (!state) throw new Error(`Agent ${id} not found`);

  let proc: ChildProcess;

  if (state.warmProc && state.warmProc.stdin?.writable) {
    proc = state.warmProc;
    state.warmProc = null;
    console.log("[agent-manager] using warm process for %s (pid %d)", id, proc.pid);
  } else {
    console.log("[agent-manager] cold start for %s", id);
    proc = spawnWarmForAgent(state.info.systemPrompt);
  }

  state.info.busy = true;

  let prompt = message;
  if (focusContext) {
    prompt = `[Context:\n${focusContext}]\n\n${message}`;
  }

  proc.stdin!.write(prompt);
  proc.stdin!.end();

  // Re-warm after response
  proc.on("close", () => {
    state.info.busy = false;
    if (agents.has(id)) {
      const newWarm = spawnWarmForAgent(state.info.systemPrompt);
      newWarm.on("error", () => {
        if (state.warmProc === newWarm) state.warmProc = null;
      });
      newWarm.on("exit", () => {
        if (state.warmProc === newWarm) state.warmProc = null;
      });
      state.warmProc = newWarm;
    }
  });

  return proc;
}

// ─── Create default agent on module load ───────────────────────────
createAgent("Pilot", "general");
