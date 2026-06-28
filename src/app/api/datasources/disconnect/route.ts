import { NextRequest, NextResponse } from "next/server";
import { removeTokens, disableService, removeComposioConnections } from "@/lib/datasources/token-store";
import { removePostHogConfig } from "@/lib/datasources/connectors/posthog";
import { clearDatasourceDataCache } from "@/lib/datasources/manager";
import { removeMcpServerByPreset } from "@/lib/datasources/mcp-store";
import type { ServiceId } from "@/lib/datasources/types";

const VALID_SERVICES: ServiceId[] = [
  "google",
  "linear",
  "github",
  "notion",
  "slack",
  "granola",
  "posthog",
  "attio",
];

const MCP_PRESET_SERVICES: ServiceId[] = ["granola", "attio"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const service = body.service as ServiceId;

  if (!service || !VALID_SERVICES.includes(service)) {
    return NextResponse.json(
      { error: "Invalid service" },
      { status: 400 }
    );
  }

  if (service === "posthog") {
    removePostHogConfig();
  } else if (MCP_PRESET_SERVICES.includes(service)) {
    removeMcpServerByPreset(service === "attio" ? "attio" : "granola");
    disableService(service);
  } else {
    removeTokens(service);
    // Also clear Composio connections for Google
    if (service === "google") {
      removeComposioConnections();
    }
  }
  clearDatasourceDataCache();
  return NextResponse.json({ success: true });
}
