import { NextRequest, NextResponse } from "next/server";
import { runTask, listTasks } from "@/lib/scheduler/index";

// Import to register tasks
import "@/lib/scheduler/tasks/daily-briefing";
import "@/lib/scheduler/tasks/meeting-prep";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ task: string }> },
) {
  const { task } = await params;

  if (task === "list") {
    const tasks = listTasks();
    return NextResponse.json({ tasks });
  }

  // Execute the task
  const result = await runTask(task);

  if (result.ok) {
    return NextResponse.json({ ok: true, task });
  }

  return NextResponse.json(
    { ok: false, error: result.error },
    { status: result.error?.includes("not found") ? 404 : 500 },
  );
}
