import { NextRequest } from "next/server";
import { getMemoryStore, type MemoryTarget, type MemoryAction } from "@/lib/memory";

/** GET /api/memory — list all entries */
export async function GET() {
  const store = getMemoryStore();
  return Response.json({
    memory: store.getEntries("memory"),
    user: store.getEntries("user"),
  });
}

/** POST /api/memory — add, replace, or remove an entry */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, target, content, old_text } = body as {
    action: MemoryAction;
    target: MemoryTarget;
    content?: string;
    old_text?: string;
  };

  if (!action || !target) {
    return Response.json({ error: "Missing action or target" }, { status: 400 });
  }
  if (!["add", "replace", "remove"].includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }
  if (!["memory", "user"].includes(target)) {
    return Response.json({ error: "Invalid target" }, { status: 400 });
  }

  const store = getMemoryStore();
  let result: { ok: boolean; error?: string };

  switch (action) {
    case "add":
      result = store.add(target, content || "");
      break;
    case "replace":
      result = store.replace(target, old_text || "", content || "");
      break;
    case "remove":
      result = store.remove(target, old_text || "");
      break;
  }

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({
    ok: true,
    memory: store.getEntries("memory"),
    user: store.getEntries("user"),
  });
}
