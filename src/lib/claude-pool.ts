import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { getContext, buildSystemPrompt } from "./context";
import { fetchAllData } from "./datasources/manager";
import type { DatasourceData } from "./datasources/types";

/**
 * Pre-warms a `claude -p` process with the system prompt baked in.
 *
 * `claude -p --append-system-prompt <sys>` reads the user prompt from stdin,
 * responds on stdout, then exits. By pre-spawning with stdin open, the
 * expensive startup (binary load, auth, model init) happens in the background.
 * When a request arrives, we just write the user message and close stdin —
 * response starts immediately.
 */

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

// Cache live datasource data with TTL
let cachedLiveData: DatasourceData | undefined;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

async function getLiveData(): Promise<DatasourceData | undefined> {
  const now = Date.now();
  if (cachedLiveData && now - cacheTimestamp < CACHE_TTL) {
    return cachedLiveData;
  }
  try {
    cachedLiveData = await fetchAllData();
    cacheTimestamp = now;
    return cachedLiveData;
  } catch {
    return cachedLiveData; // Return stale data on error
  }
}

function getSystemPrompt(liveData?: DatasourceData): string {
  return buildSystemPrompt(getContext(), liveData);
}

// Initial system prompt (without live data for fast startup)
let currentSystemPrompt = getSystemPrompt();

let warmProc: ChildProcess | null = null;

// Resolve MCP config path (project root)
const mcpConfigPath = join(process.cwd(), "cockpit-mcp.json");

function spawnWarm(): ChildProcess {
  const args = ["-p", "--output-format", "text", "--append-system-prompt", currentSystemPrompt];

  // Add MCP config if the file exists and the server is likely running
  if (existsSync(mcpConfigPath)) {
    args.push("--mcp-config", mcpConfigPath);
  }

  const proc = spawn("claude", args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: cleanEnv(),
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    console.error("[claude-pool:warm:stderr]", chunk.toString());
  });

  proc.on("error", (err) => {
    console.error("[claude-pool] warm error:", err.message);
    if (warmProc === proc) warmProc = null;
  });

  proc.on("exit", () => {
    if (warmProc === proc) warmProc = null;
  });

  return proc;
}

export function preheat() {
  if (warmProc) return;
  console.log("[claude-pool] pre-warming...");
  warmProc = spawnWarm();
  console.log("[claude-pool] warm process ready (pid %d)", warmProc.pid);
}

/**
 * Get a ready-to-go claude process. Writes the user message to stdin
 * and returns the process (stdout is already streaming the response).
 *
 * Any focus context is prepended to the user message rather than
 * the system prompt, so the warm process can be reused regardless of context.
 */
export function send(userMessage: string, focusContext?: string): ChildProcess {
  let proc: ChildProcess;

  if (warmProc && warmProc.stdin?.writable) {
    proc = warmProc;
    warmProc = null;
    console.log("[claude-pool] using warm process (pid %d)", proc.pid);
  } else {
    console.log("[claude-pool] cold start...");
    proc = spawnWarm();
  }

  // Build the full user prompt — include focus context if present
  let prompt = userMessage;
  if (focusContext) {
    prompt = `[The user is currently focused on this section of their cockpit:\n${focusContext}]\n\n${userMessage}`;
  }

  proc.stdin!.write(prompt);
  proc.stdin!.end();

  // Immediately start warming the next process with fresh data
  setTimeout(async () => {
    const live = await getLiveData();
    if (live) currentSystemPrompt = getSystemPrompt(live);
    preheat();
  }, 50);

  return proc;
}

// Auto-preheat on module load (async refresh of live data)
preheat();
getLiveData().then((live) => {
  if (live) {
    currentSystemPrompt = getSystemPrompt(live);
    // Kill stale warm process so next one gets fresh context
    if (warmProc) {
      warmProc.kill();
      warmProc = null;
    }
    preheat();
  }
});
