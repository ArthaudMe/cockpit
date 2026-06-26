import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { buildAgentEnv } from "@/lib/agent-env";

const execFileAsync = promisify(execFile);
const env = buildAgentEnv();

export async function POST() {
  // First check if already installed
  try {
    await execFileAsync("claude", ["--version"], { timeout: 5000, env });
    return NextResponse.json({ success: true, message: "Already installed" });
  } catch {
    // Not installed, proceed
  }

  // Install via npm instead of piping a remote shell script to bash.
  try {
    await execFileAsync("npm", ["install", "-g", "@anthropic-ai/claude-code"], {
      timeout: 120000,
      env,
    });

    // Verify installation
    const { stdout } = await execFileAsync("claude", ["--version"], {
      timeout: 5000,
      env,
    });

    return NextResponse.json({
      success: true,
      version: stdout.trim(),
    });
  } catch (err) {
    console.error("[install-claude]", err);
    return NextResponse.json({
      success: false,
      error: "Installation failed. Try running the install command manually in Terminal.",
    });
  }
}
