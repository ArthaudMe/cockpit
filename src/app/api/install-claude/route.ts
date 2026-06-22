import { NextResponse } from "next/server";
import { execFile, exec } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

export async function POST() {
  // First check if already installed
  try {
    await execFileAsync("claude", ["--version"], { timeout: 5000 });
    return NextResponse.json({ success: true, message: "Already installed" });
  } catch {
    // Not installed, proceed
  }

  // Try to install via the official install script
  try {
    await execAsync("curl -fsSL https://claude.ai/install.sh | bash", {
      timeout: 60000,
      shell: "/bin/bash",
    });

    // Verify installation
    const { stdout } = await execFileAsync("claude", ["--version"], {
      timeout: 5000,
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
