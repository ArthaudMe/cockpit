import { NextRequest, NextResponse } from "next/server";
import {
  getAllNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/lib/background/notifier";

export async function GET() {
  const notifications = getAllNotifications();
  const unreadCount = getUnreadCount();

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.markAllRead) {
      markAllAsRead();
    } else if (body.ids && Array.isArray(body.ids)) {
      markAsRead(body.ids);
    }

    return NextResponse.json({ ok: true, unreadCount: getUnreadCount() });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
