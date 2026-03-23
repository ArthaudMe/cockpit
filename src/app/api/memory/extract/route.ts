import { NextRequest } from "next/server";
import { extractMemories } from "@/lib/memory";
import type { SessionForExtraction, ConversationTurn } from "@/lib/memory";

export const maxDuration = 60;

/** POST /api/memory/extract — extract memories from a conversation */
export async function POST(req: NextRequest) {
  const { messages, agentId, agentName } = await req.json();

  if (!messages || !Array.isArray(messages) || messages.length < 2) {
    return Response.json({ extracted: [] });
  }

  const session: SessionForExtraction = {
    sessionId: `${agentId || "default"}_${Date.now()}`,
    agentId: agentId || "default",
    agentName: agentName || "Pilot",
    turns: messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })) as ConversationTurn[],
    timestamp: Date.now(),
  };

  const extracted = await extractMemories(session);
  return Response.json({ extracted });
}
