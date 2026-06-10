import { NextRequest, NextResponse } from "next/server";
import { getAgent, deleteAgent, updateAgent, ensureAgentRuntimeStarted } from "@/lib/agent-manager";

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
