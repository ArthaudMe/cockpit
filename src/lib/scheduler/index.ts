import * as cron from "node-cron";

type ScheduledTask = {
  name: string;
  schedule: string; // cron expression
  handler: () => Promise<void>;
  enabled: boolean;
};

type CronJob = ReturnType<typeof cron.schedule>;

const tasks: ScheduledTask[] = [];
const runningJobs: Map<string, CronJob> = new Map();
let initialized = false;

export function registerTask(task: ScheduledTask): void {
  tasks.push(task);
}

export function startScheduler(): void {
  if (initialized) return;
  initialized = true;

  for (const task of tasks) {
    if (!task.enabled) continue;

    const job = cron.schedule(task.schedule, async () => {
      console.log(`[scheduler] Running task: ${task.name}`);
      try {
        await task.handler();
        console.log(`[scheduler] Task completed: ${task.name}`);
      } catch (err) {
        console.error(`[scheduler] Task failed: ${task.name}`, err);
      }
    });

    runningJobs.set(task.name, job);
    console.log(
      `[scheduler] Registered task: ${task.name} (${task.schedule})`,
    );
  }
}

export function stopScheduler(): void {
  for (const [name, job] of runningJobs) {
    job.stop();
    console.log(`[scheduler] Stopped task: ${name}`);
  }
  runningJobs.clear();
  initialized = false;
}

export async function runTask(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const task = tasks.find((t) => t.name === name);
  if (!task) {
    return { ok: false, error: `Task not found: ${name}` };
  }

  try {
    await task.handler();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Task failed",
    };
  }
}

export function listTasks(): {
  name: string;
  schedule: string;
  enabled: boolean;
}[] {
  return tasks.map((t) => ({
    name: t.name,
    schedule: t.schedule,
    enabled: t.enabled,
  }));
}
