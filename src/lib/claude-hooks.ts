/**
 * Claude Hook Service
 *
 * Injects hook configuration into Claude CLI so it sends structured
 * events back to Cockpit's agent event server via curl.
 *
 * Claude Code supports hooks in .claude/settings.local.json:
 * - Notification hook: fires when Claude wants attention
 * - Stop hook: fires when Claude stops (idle, error, etc.)
 */

import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

interface HookConfig {
  port: number;
  token: string;
  agentId: string;
}

const HOOK_DIRS = new Map<string, { dir: string; port: number; token: string }>();

/** Agent IDs are hex strings from randomBytes — reject anything else. */
const SAFE_AGENT_ID = /^[a-f0-9]{8}$/;

/**
 * Create a temp directory with Claude hook settings for an agent.
 * Returns the path to use as the working directory when spawning Claude,
 * so it picks up the .claude/settings.local.json.
 *
 * Agents respawn after every message; the hook dir is reused across
 * respawns (it only depends on agentId/port/token) instead of leaking a
 * fresh temp dir each time.
 */
export function setupClaudeHooks(config: HookConfig): string {
  // Validate agentId to prevent shell injection — it's embedded in curl commands.
  // genId() produces 8 hex chars; reject anything else.
  if (!SAFE_AGENT_ID.test(config.agentId)) {
    console.error("[claude-hooks] refusing invalid agentId: %s", config.agentId);
    throw new Error("Invalid agentId for hook setup");
  }

  const existing = HOOK_DIRS.get(config.agentId);
  if (
    existing &&
    existing.port === config.port &&
    existing.token === config.token &&
    existsSync(existing.dir)
  ) {
    return existing.dir;
  }

  const hookDir =
    existing?.dir ?? join(tmpdir(), `cockpit-hooks-${randomBytes(4).toString("hex")}`);
  const claudeDir = join(hookDir, ".claude");

  mkdirSync(claudeDir, { recursive: true });

  // Port/token/agentId are validated — safe to interpolate into the shell command.
  const curlBase = `curl -s -X POST http://127.0.0.1:${config.port}/hook -H "Content-Type: application/json" -H "X-Cockpit-Token: ${config.token}"`;

  const settings = {
    hooks: {
      Notification: [
        {
          type: "command",
          command: `${curlBase} -d '{"agentId":"${config.agentId}","type":"notification","message":"$CLAUDE_NOTIFICATION"}'`,
        },
      ],
      Stop: [
        {
          type: "command",
          command: `${curlBase} -d '{"agentId":"${config.agentId}","type":"stop","message":"Agent stopped"}'`,
        },
      ],
    },
  };

  writeFileSync(
    join(claudeDir, "settings.local.json"),
    JSON.stringify(settings, null, 2)
  );

  HOOK_DIRS.set(config.agentId, { dir: hookDir, port: config.port, token: config.token });
  console.log("[claude-hooks] set up hooks for agent %s at %s", config.agentId, hookDir);

  return hookDir;
}

/**
 * Clean up hook directory for an agent.
 */
export function cleanupClaudeHooks(agentId: string) {
  const entry = HOOK_DIRS.get(agentId);
  if (entry && existsSync(entry.dir)) {
    try {
      rmSync(entry.dir, { recursive: true });
      HOOK_DIRS.delete(agentId);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Clean up all hook directories.
 */
export function cleanupAllHooks() {
  for (const [agentId] of HOOK_DIRS) {
    cleanupClaudeHooks(agentId);
  }
}
