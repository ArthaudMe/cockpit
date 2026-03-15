import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  error?: string;
};

async function detectClaude(): Promise<BackendStatus> {
  try {
    const { stdout } = await execFileAsync("claude", ["--version"], {
      timeout: 5000,
      env: cleanEnv(),
    });
    return { id: "claude", label: "Claude", installed: true, version: stdout.trim() };
  } catch {
    return { id: "claude", label: "Claude", installed: false };
  }
}

async function detectCodex(): Promise<BackendStatus> {
  try {
    const { stdout } = await execFileAsync("codex", ["--version"], {
      timeout: 5000,
      env: cleanEnv(),
    });
    return { id: "codex", label: "Codex", installed: true, version: stdout.trim() };
  } catch {
    return { id: "codex", label: "Codex", installed: false };
  }
}

async function detectOllama(): Promise<BackendStatus> {
  try {
    const { stdout } = await execFileAsync("ollama", ["--version"], {
      timeout: 5000,
      env: cleanEnv(),
    });
    return { id: "ollama", label: "Ollama", installed: true, version: stdout.trim() };
  } catch {
    return { id: "ollama", label: "Ollama", installed: false };
  }
}

export async function GET() {
  const [claude, codex, ollama] = await Promise.all([
    detectClaude(),
    detectCodex(),
    detectOllama(),
  ]);

  return NextResponse.json({
    backends: [claude, codex, ollama],
    anyAvailable: claude.installed || codex.installed || ollama.installed,
  });
}
