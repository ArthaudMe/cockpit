import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { getSpawnTarget } from "@/lib/provider-runtime";

export async function POST() {
  // Spawn `claude login` which opens the browser for OAuth
  try {
    const target = getSpawnTarget("claude");
    const proc = spawn(target.command, ["login"], {
      stdio: "ignore",
      detached: true,
      env: target.env,
    });

    // Detach so it doesn't block the server
    proc.unref();

    return NextResponse.json({
      success: true,
      message: "Auth flow started — check your browser",
    });
  } catch (err) {
    console.error("[authenticate-claude]", err);
    return NextResponse.json({
      success: false,
      error: "Could not start auth flow. Make sure Claude CLI is installed.",
    });
  }
}
