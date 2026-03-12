import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function GET() {
  // Remove CLAUDECODE to allow checking inside a Claude Code session
  const env = { ...process.env };
  delete env.CLAUDECODE;

  try {
    const { stdout } = await execFileAsync("claude", ["--version"], {
      timeout: 5000,
      env,
    });
    return NextResponse.json({
      connected: true,
      version: stdout.trim(),
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error:
        err instanceof Error ? err.message : "Claude CLI not found or not authenticated",
    });
  }
}
