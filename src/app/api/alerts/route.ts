import { NextRequest, NextResponse } from "next/server";
import {
  getAlerts,
  getUnreadAlertCount,
  markAlertRead,
  markAlertActioned,
  markAllAlertsRead,
  deleteAlert,
} from "@/lib/db/alerts";

export async function GET(req: NextRequest) {
  const unreadOnly =
    req.nextUrl.searchParams.get("unreadOnly") === "true";
  const alerts = getAlerts({ unreadOnly });
  const unreadCount = getUnreadAlertCount();
  return NextResponse.json({ alerts, unreadCount });
}

export async function POST(req: NextRequest) {
  const { action, alertId } = await req.json();

  switch (action) {
    case "markRead":
      markAlertRead(alertId);
      break;
    case "markActioned":
      markAlertActioned(alertId);
      break;
    case "markAllRead":
      markAllAlertsRead();
      break;
    case "delete":
      deleteAlert(alertId);
      break;
    default:
      return new Response("Unknown action", { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
