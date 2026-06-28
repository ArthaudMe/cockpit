import { NextRequest } from "next/server";
import { getAgent, listAgents, ensureAgentRuntimeStarted } from "@/lib/agent-manager";
import { streamAgentResponse } from "@/lib/agent-stream";
import { getProvider } from "@/lib/provider-registry";
import { detectProvider } from "@/lib/provider-runtime";

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
    const provider = getProvider(agent.backend);
    const detected = provider ? await detectProvider(provider) : { ok: false, error: "Unknown backend" };
    if (detected.ok) {
      return streamAgentResponse(id, { message: message || "", focusContext, images });
    }

    const fallback = await findFallbackAgent(id);
    if (fallback) {
      const response = streamAgentResponse(fallback.id, { message: message || "", focusContext, images });
      response.headers.set("X-Cockpit-Fallback-Agent", fallback.id);
      response.headers.set("X-Cockpit-Fallback-Reason", detected.error || `${agent.backend} is not available`);
      return response;
    }

    return new Response(detected.error || `${agent.backend} is not available`, { status: 503 });
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Failed to send message",
      { status: 500 }
    );
  }
}

async function findFallbackAgent(skipId: string) {
  for (const candidate of listAgents()) {
    if (candidate.id === skipId) continue;
    const provider = getProvider(candidate.backend);
    if (!provider) continue;
    const detected = await detectProvider(provider);
    if (detected.ok) return candidate;
  }
  return null;
}
