import { NextResponse } from "next/server";
import {
  clearDashboards,
  getActiveDashboard,
  getDashboardStore,
  saveDashboard,
} from "@/lib/dashboard/store";

export async function GET() {
  const store = getDashboardStore();
  return NextResponse.json({
    ...store,
    activeDashboard: getActiveDashboard(),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const payload = "dashboard" in body ? body.dashboard : body;

  try {
    const dashboard = saveDashboard(payload);
    return NextResponse.json({ dashboard });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid dashboard payload" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  clearDashboards();
  return NextResponse.json({ ok: true });
}
