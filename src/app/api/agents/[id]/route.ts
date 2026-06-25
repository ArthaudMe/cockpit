import { NextRequest, NextResponse } from "next/server";
import { getAgent, deleteAgent, updateAgent, ensureAgentRuntimeStarted, type AgentRole } from "@/lib/agent-manager";
import { PROVIDERS } from "@/lib/provider-registry";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(agent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const body = await req.json();

  // Validate fields before mutating agent state
  const errors: string[] = [];

  if (body.backend !== undefined) {
    if (typeof body.backend !== "string" || !PROVIDERS[body.backend]) {
      errors.push(`invalid backend: ${body.backend} (valid: ${Object.keys(PROVIDERS).join(", ")})`);
    }
  }

  const validRoles: AgentRole[] = ["general", "research", "writer", "ops"];
  if (body.role !== undefined) {
    if (!validRoles.includes(body.role)) {
      errors.push(`invalid role: ${body.role} (valid: ${validRoles.join(", ")})`);
    }
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      errors.push("name must be a non-empty string");
    }
  }

  if (body.model !== undefined) {
    if (typeof body.model !== "string") {
      errors.push("model must be a string");
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  const updated = updateAgent(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const deleted = deleteAgent(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
