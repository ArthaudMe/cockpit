import { NextResponse } from "next/server";
import { unifiedSearch } from "@/lib/search/unified";
import { liveSearch } from "@/lib/search/live";
import { fetchAllData } from "@/lib/datasources/manager";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const live = searchParams.get("live") === "1";

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (live) {
      const results = await liveSearch(query);
      return NextResponse.json({ results, live: true });
    }

    const data = await fetchAllData();
    const results = unifiedSearch(query, data);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[Search]", err);
    return NextResponse.json(
      { error: "Search failed", results: [] },
      { status: 500 },
    );
  }
}
