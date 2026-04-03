import { NextResponse } from "next/server";
import { unifiedSearch } from "@/lib/search/unified";
import { fetchAllData } from "@/lib/datasources/manager";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || !query.trim()) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await fetchAllData();
    const results = unifiedSearch(query, data);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Search failed", results: [] },
      { status: 500 },
    );
  }
}
