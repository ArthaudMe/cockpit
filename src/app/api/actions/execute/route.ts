import { NextRequest, NextResponse } from "next/server";
import { executeAction, isValidActionType } from "@/lib/actions/executor";
import { logAction } from "@/lib/actions/log";
import type { ActionBlock, ActionLogEntry } from "@/lib/actions/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cockpit_action, params } = body;

    if (!cockpit_action || typeof cockpit_action !== "string") {
      return NextResponse.json(
        { success: false, message: "Missing cockpit_action" },
        { status: 400 }
      );
    }

    if (!isValidActionType(cockpit_action)) {
      return NextResponse.json(
        { success: false, message: `Unsupported action type: ${cockpit_action}` },
        { status: 400 }
      );
    }

    const action: ActionBlock = {
      cockpit_action: cockpit_action as ActionBlock["cockpit_action"],
      params: params || {},
      confirm: false, // Already confirmed by reaching this endpoint
    };

    const result = await executeAction(action);

    const logEntry: ActionLogEntry = {
      id: crypto.randomUUID(),
      action: action.cockpit_action,
      params: action.params,
      result,
      timestamp: new Date().toISOString(),
      approved: true,
    };
    logAction(logEntry);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[actions/execute] error:", (err as Error).message);
    return NextResponse.json(
      { success: false, message: "Action failed due to a server error" },
      { status: 500 }
    );
  }
}
