// Import tasks to register them
import "./tasks/daily-briefing";
import "./tasks/meeting-prep";

import { startScheduler } from "./index";

let started = false;

export function ensureSchedulerStarted(): void {
  if (started) return;
  started = true;

  // Only start the in-process scheduler in development
  if (process.env.NODE_ENV === "development") {
    startScheduler();
    console.log("[scheduler] Started in-process scheduler (dev mode)");
  }
}
