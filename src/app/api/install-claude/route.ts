import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getSpawnTarget } from "@/lib/provider-runtime";

const execFileAsync = promisify(execFile);

export async function POST() {
  // First check if already installed
  try {
    const claude = getSpawnTarget("claude");
    await execFileAsync(claude.command, ["--version"], { timeout: 5000, env: claude.env });
    return NextResponse.json({ success: true, message: "Already installed" });
  } catch {
    // Not installed, proceed
  }

  // Install via npm instead of piping a remote shell script to bash.
  try {
    const npm = getSpawnTarget("npm");
    await execFileAsync(npm.command, ["install", "-g", "@anthropic-ai/claude-code"], {
      timeout: 120000,
      env: npm.env,
    });

    // Verify installation
    const claude = getSpawnTarget("claude");
    const { stdout } = await execFileAsync(claude.command, ["--version"], {
      timeout: 5000,
      env: claude.env,
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
