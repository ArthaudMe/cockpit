import { NextRequest } from "next/server";
import { getDefaultAgent, ensureAgentRuntimeStarted } from "@/lib/agent-manager";
import { streamAgentResponse } from "@/lib/agent-stream";

export const maxDuration = 300;

/**
 * Focus-view chat. Routes through the default agent so the whole app has
 * a single chat engine — same warm process, same memory, same history.
 */
export async function POST(req: NextRequest) {
  const { message, focusContext } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  try {
    await ensureAgentRuntimeStarted();
    const agent = getDefaultAgent();
    return streamAgentResponse(agent.id, { message, focusContext });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Failed to send message",
      { status: 500 }
    );
  }
}
