import { NextRequest, NextResponse } from "next/server";
import { getLatestBriefing, getBriefings } from "@/lib/db/alerts";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");

  if (type) {
    const briefing = getLatestBriefing(type);
    return NextResponse.json({ briefing });
  }

  const briefings = getBriefings();
  return NextResponse.json({ briefings });
}
