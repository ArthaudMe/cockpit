import { NextRequest, NextResponse } from "next/server";
import {
  getPostHogConfig,
  removePostHogConfig,
  savePostHogConfig,
  validatePostHogConfig,
} from "@/lib/datasources/connectors/posthog";
import { clearDatasourceDataCache } from "@/lib/datasources/manager";

export async function GET() {
  const config = getPostHogConfig();
  return NextResponse.json({
    configured: !!config,
    apiHost: config?.apiHost ?? "https://us.posthog.com",
    projectId: config?.projectId ?? "",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const config = {
    apiHost: String(body.apiHost || "https://us.posthog.com"),
    projectId: String(body.projectId || ""),
    personalApiKey: String(body.personalApiKey || ""),
  };

  try {
    await validatePostHogConfig(config);
    savePostHogConfig(config);
    clearDatasourceDataCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PostHog connection failed" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  removePostHogConfig();
  clearDatasourceDataCache();
  return NextResponse.json({ ok: true });
}
