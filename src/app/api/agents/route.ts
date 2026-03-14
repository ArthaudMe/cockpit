import { NextRequest, NextResponse } from "next/server";
import { createAgent, listAgents, type AgentRole } from "@/lib/agent-manager";

export async function GET() {
  return NextResponse.json(listAgents());
}

export async function POST(req: NextRequest) {
  const { name, role, systemPrompt } = await req.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const validRoles: AgentRole[] = ["general", "research", "writer", "ops"];
  const agentRole = validRoles.includes(role) ? role : "general";

  const agent = createAgent(name, agentRole, systemPrompt);
  return NextResponse.json(agent, { status: 201 });
}
