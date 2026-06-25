import { NextRequest, NextResponse } from "next/server";
import {
  getMcpServer,
  updateMcpServer,
  removeMcpServer,
  validateMcpServerConfig,
} from "@/lib/datasources/mcp-store";
import { disconnectClient } from "@/lib/datasources/connectors/mcp";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(server);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates = await req.json();
  // Don't allow changing the id or addedAt
  delete updates.id;
  delete updates.addedAt;

  // Validate the merged config (existing + patch), not just the patch alone
  const merged = { ...server, ...updates };
  const validationError = validateMcpServerConfig(merged);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Sanitize fields before persisting
  if (typeof updates.name === "string") {
    updates.name = updates.name.slice(0, 100);
  }
  if (Array.isArray(updates.args)) {
    updates.args = updates.args.map(String);
  }

  updateMcpServer(id, updates);

  // If config changed, disconnect so it reconnects with new config
  await disconnectClient(id);

  return NextResponse.json(getMcpServer(id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await disconnectClient(id);
  removeMcpServer(id);
  return NextResponse.json({ ok: true });
}
