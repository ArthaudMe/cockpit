import { NextRequest } from "next/server";
import {
  getAllMemories,
  getMemoryStats,
  deleteMemory,
  clearAllMemories,
} from "@/lib/memory";

/** GET /api/memory — list all memories + stats */
export async function GET() {
  const memories = getAllMemories();
  const stats = getMemoryStats();
  return Response.json({ memories, stats });
}

/** DELETE /api/memory — delete a specific memory or clear all */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();

  if (id === "*") {
    clearAllMemories();
    return Response.json({ ok: true, cleared: true });
  }

  const deleted = deleteMemory(id);
  if (!deleted) {
    return new Response("Memory not found", { status: 404 });
  }
  return Response.json({ ok: true, deleted: id });
}
