import { NextRequest, NextResponse } from "next/server";
import { routeWebhook } from "@/lib/webhooks/router";
import { getSlackChallenge } from "@/lib/webhooks/handlers/slack";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const payload = await req.json();

  // Handle Slack URL verification
  if (source === "slack") {
    const challenge = getSlackChallenge(payload);
    if (challenge) {
      return NextResponse.json({ challenge });
    }
  }

  try {
    const result = await routeWebhook(source, payload);
    return NextResponse.json(result);
  } catch (err) {
    console.error(`[webhook/${source} error]`, err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}
