import { NextRequest, NextResponse } from "next/server";
import { getConnectorStatuses } from "@/lib/context";
import {
  getConfig,
  saveConfig,
  type ConnectorConfig,
} from "@/lib/config";

export async function GET() {
  const statuses = getConnectorStatuses();
  return NextResponse.json({ connectors: statuses });
}

export async function POST(req: NextRequest) {
  const { connector, config: connectorConfig } = await req.json();

  if (!connector || !connectorConfig) {
    return new Response("Missing connector or config", { status: 400 });
  }

  const appConfig = getConfig();
  appConfig.connectors[connector as keyof ConnectorConfig] =
    connectorConfig;
  saveConfig(appConfig);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { connector } = await req.json();

  if (!connector) {
    return new Response("Missing connector", { status: 400 });
  }

  const appConfig = getConfig();
  delete appConfig.connectors[connector as keyof ConnectorConfig];
  saveConfig(appConfig);

  return NextResponse.json({ ok: true });
}
