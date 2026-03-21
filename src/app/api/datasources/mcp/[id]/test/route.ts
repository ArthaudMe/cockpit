import { NextRequest, NextResponse } from "next/server";
import { getMcpServer } from "@/lib/datasources/mcp-store";
import { testMcpConnection } from "@/lib/datasources/connectors/mcp";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await testMcpConnection(server);
  return NextResponse.json(result);
}
