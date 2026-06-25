import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { buildAgentEnv } from "@/lib/agent-env";

const execFileAsync = promisify(execFile);

async function check(bin: string, args: string[]): Promise<{ ok: boolean; version?: string }> {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 5000, env: buildAgentEnv() });
    return { ok: true, version: stdout.trim() };
  } catch {
    return { ok: false };
  }
}

export async function GET() {
  const [claude, codex, ollama] = await Promise.all([
    check("claude", ["--version"]),
    check("codex", ["--version"]),
    check("ollama", ["--version"]),
  ]);

  const connected = claude.ok || codex.ok || ollama.ok;

  return NextResponse.json({
    connected,
    version: claude.version || codex.version || ollama.version,
    cwd: process.cwd(),
    backends: {
      claude: { connected: claude.ok, version: claude.version },
      codex: { connected: codex.ok, version: codex.version },
      ollama: { connected: ollama.ok, version: ollama.version },
    },
  });
}
