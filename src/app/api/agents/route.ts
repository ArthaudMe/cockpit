import { NextRequest, NextResponse } from "next/server";
import { createAgent, listAgents, ensureAgentRuntimeStarted, type AgentRole, type AgentBackend } from "@/lib/agent-manager";
import { isProviderId } from "@/lib/provider-registry";

export async function GET() {
  await ensureAgentRuntimeStarted();
  return NextResponse.json(listAgents());
}

export async function POST(req: NextRequest) {
  await ensureAgentRuntimeStarted();
  const { name, role, systemPrompt, backend, model } = await req.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const validRoles: AgentRole[] = ["general", "research", "writer", "ops"];
  const agentRole = validRoles.includes(role) ? role : "general";

  const agentBackend: AgentBackend = isProviderId(backend) ? backend : "claude";

  const agent = createAgent(name, agentRole, systemPrompt, agentBackend, model);
  return NextResponse.json(agent, { status: 201 });
}
