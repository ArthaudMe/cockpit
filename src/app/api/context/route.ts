import { NextResponse } from "next/server";
import {
  getContextAsync,
  getConnectorStatuses,
  isLiveMode,
  invalidateContextCache,
} from "@/lib/context";

export async function GET() {
  try {
    const context = await getContextAsync();
    const connectors = getConnectorStatuses();
    const live = isLiveMode();

    return NextResponse.json({
      context,
      connectors,
      mode: live ? "live" : "demo",
    });
  } catch (err) {
    console.error("[context fetch error]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch context",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  // Force refresh
  invalidateContextCache();
  const context = await getContextAsync();
  return NextResponse.json({ context, refreshed: true });
}
