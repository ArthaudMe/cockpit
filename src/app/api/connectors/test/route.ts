import { NextRequest, NextResponse } from "next/server";
import { LinearConnector } from "@/lib/connectors/linear";
import { GitHubConnector } from "@/lib/connectors/github";
import { GoogleCalendarConnector } from "@/lib/connectors/google-calendar";
import { SlackConnector } from "@/lib/connectors/slack";

const connectorMap: Record<string, { fetchContext: () => Promise<unknown> }> = {
  linear: new LinearConnector(),
  github: new GitHubConnector(),
  "google-calendar": new GoogleCalendarConnector(),
  slack: new SlackConnector(),
};

export async function POST(req: NextRequest) {
  const { connector } = await req.json();

  if (!connector || !connectorMap[connector]) {
    return NextResponse.json(
      { ok: false, error: "Unknown connector" },
      { status: 400 },
    );
  }

  try {
    const data = await connectorMap[connector].fetchContext();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Connection test failed",
      },
      { status: 500 },
    );
  }
}
