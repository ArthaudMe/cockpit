import { NextRequest, NextResponse } from "next/server";
import { removeTokens } from "@/lib/datasources/token-store";
import type { ServiceId } from "@/lib/datasources/types";

const VALID_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const service = body.service as ServiceId;

  if (!service || !VALID_SERVICES.includes(service)) {
    return NextResponse.json(
      { error: "Invalid service" },
      { status: 400 }
    );
  }

  removeTokens(service);
  return NextResponse.json({ success: true });
}
