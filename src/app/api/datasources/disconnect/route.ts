import { NextRequest, NextResponse } from "next/server";
import { removeTokens, disableService } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";

const VALID_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
  "granola",
];

// Auto-detected services use disable instead of token removal
const AUTO_DETECTED: ServiceId[] = ["granola"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const service = body.service as ServiceId;

  if (!service || !VALID_SERVICES.includes(service)) {
    return NextResponse.json(
      { error: "Invalid service" },
      { status: 400 }
    );
  }

  if (AUTO_DETECTED.includes(service)) {
    disableService(service);
  } else {
    removeTokens(service);
  }
  return NextResponse.json({ success: true });
}
