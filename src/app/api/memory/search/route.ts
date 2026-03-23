import { NextRequest } from "next/server";
import { searchMemories } from "@/lib/memory";

export const maxDuration = 60;

/** POST /api/memory/search — agentic memory search (3 parallel agents) */
export async function POST(req: NextRequest) {
  const { query, categories, limit } = await req.json();

  if (!query || typeof query !== "string") {
    return new Response("Missing query", { status: 400 });
  }

  const results = await searchMemories({ query, categories, limit });
  return Response.json({ results });
}
