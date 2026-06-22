import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  // Inside packaged Electron, PATH may be minimal. Ensure common binary
  // locations are included so we can find claude/codex/ollama.
  const home = env.HOME || "";
  const extras = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/current/bin`,
    `${home}/.cargo/bin`,
  ];
  const existing = env.PATH || "/usr/bin:/bin";
  env.PATH = [...extras, ...existing.split(":")].filter(Boolean).join(":");
  return env;
}

async function check(bin: string, args: string[]): Promise<{ ok: boolean; version?: string }> {
  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 5000, env: cleanEnv() });
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
