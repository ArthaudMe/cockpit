import { NextResponse } from "next/server";
import { spawn } from "child_process";

export async function POST() {
  // Spawn `claude login` which opens the browser for OAuth
  try {
    const proc = spawn("claude", ["login"], {
      stdio: "ignore",
      detached: true,
    });

    // Detach so it doesn't block the server
    proc.unref();

    return NextResponse.json({
      success: true,
      message: "Auth flow started — check your browser",
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not start auth flow",
    });
  }
}
