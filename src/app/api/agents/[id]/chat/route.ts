import { NextRequest } from "next/server";
import { getAgent, ensureAgentRuntimeStarted } from "@/lib/agent-manager";
import { streamAgentResponse } from "@/lib/agent-stream";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  const { message, focusContext, images } = await req.json();
  if ((!message || typeof message !== "string") && (!images || !Array.isArray(images) || images.length === 0)) {
    return new Response("Missing message", { status: 400 });
  }

  try {
    return streamAgentResponse(id, { message: message || "", focusContext, images });
  } catch (err) {
    return new Response(
      "Failed to send message",
      { status: 500 }
    );
  }
}
