import { spawn, type ChildProcess } from "child_process";
import { buildSystemPrompt } from "./context";
import { fetchAllData } from "./datasources/manager";
import { buildAgentEnv } from "./agent-env";
import { buildPromptPrelude } from "./prompt-prelude";

/**
 * Pre-warms a `claude -p` process with the system prompt baked in.
 *
 * `claude -p --append-system-prompt <sys>` reads the user prompt from stdin,
 * responds on stdout, then exits. By pre-spawning with stdin open, the
 * expensive startup (binary load, auth, model init) happens in the background.
 * When a request arrives, we just write the user message and close stdin —
 * response starts immediately.
 *
 * Live data caching lives in datasources/manager (fetchAllData); this module
 * deliberately has no second cache layer.
 */

// Built without live data initially; refreshed before each preheat.
let currentSystemPrompt = buildSystemPrompt();

let warmProc: ChildProcess | null = null;

async function refreshSystemPrompt(): Promise<void> {
  try {
    const live = await fetchAllData();
    currentSystemPrompt = buildSystemPrompt(live);
  } catch {
    // Keep the previous prompt on fetch failure
  }
}

function spawnWarm(): ChildProcess {
  const proc = spawn(
    "claude",
    ["-p", "--output-format", "text", "--append-system-prompt", currentSystemPrompt],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildAgentEnv(),
    }
  );

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
 * Message-dependent context (focus, history) is prepended to the user
 * message rather than the system prompt, so the warm process can be
 * reused regardless of context.
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

  const prompt = buildPromptPrelude({ message: userMessage, focusContext });

  proc.stdin!.write(prompt);
  proc.stdin!.end();

  // Immediately start warming the next process with fresh data
  setTimeout(async () => {
    await refreshSystemPrompt();
    preheat();
  }, 50);

  return proc;
}

// Auto-preheat on first import: refresh live data once, then spawn a
// single warm process (instead of spawn → kill → respawn).
refreshSystemPrompt().finally(preheat);
