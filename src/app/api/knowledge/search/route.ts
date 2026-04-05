import { NextRequest, NextResponse } from "next/server";
import { searchHistory } from "@/lib/knowledge/search";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const query = params.get("q") || "";

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  const sources = params.get("sources")
    ? params.get("sources")!.split(",").filter(Boolean)
    : undefined;

  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const limitStr = params.get("limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const results = searchHistory({
    query,
    sources,
    dateRange: from || to ? { from: from || "2000-01-01", to: to || "2099-12-31" } : undefined,
    limit,
  });

  return NextResponse.json({ results });
}
