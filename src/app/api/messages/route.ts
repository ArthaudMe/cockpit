import { NextRequest, NextResponse } from "next/server";
import {
  getMessages,
  getConversations,
  deleteConversation,
} from "@/lib/db/messages";

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get("conversationId");

  if (conversationId) {
    const messages = getMessages(conversationId);
    return NextResponse.json({ messages });
  }

  // List all conversations
  const conversations = getConversations();
  return NextResponse.json({ conversations });
}

export async function DELETE(req: NextRequest) {
  const { conversationId } = await req.json();
  if (!conversationId) {
    return new Response("Missing conversationId", { status: 400 });
  }
  deleteConversation(conversationId);
  return NextResponse.json({ ok: true });
}
