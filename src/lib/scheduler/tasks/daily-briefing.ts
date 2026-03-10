import { spawn } from "child_process";
import { getContextAsync, buildSystemPrompt } from "@/lib/context";
import { createBriefing } from "@/lib/db/alerts";
import { registerTask } from "../index";

async function runClaudePrompt(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    const proc = spawn(
      "claude",
      ["-p", "--output-format", "text", prompt],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      },
    );

    proc.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[briefing/claude stderr]", chunk.toString());
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Claude exited with code ${code}`));
      } else {
        resolve(chunks.join(""));
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

async function generateDailyBriefing(): Promise<void> {
  const ctx = await getContextAsync();
  const systemContext = buildSystemPrompt(ctx);

  const prompt = `${systemContext}

---

Generate a concise daily briefing for ${ctx.user}. Structure it as:

1. **Today's Schedule** — List meetings with prep notes
2. **Priority Items** — Top 3-5 things that need attention today
3. **Key Updates** — Important changes since yesterday
4. **Risks & Blockers** — Anything that could derail the day

Be direct and actionable. No fluff. Keep it under 500 words.`;

  const content = await runClaudePrompt(prompt);

  createBriefing({
    type: "daily",
    content,
    metadata: {
      date: new Date().toISOString().split("T")[0],
      projects: ctx.projects.map((p) => p.name),
      meetings: ctx.calendar.length,
    },
  });
}

// Register: runs at 8:00 AM every weekday
registerTask({
  name: "daily-briefing",
  schedule: "0 8 * * 1-5",
  handler: generateDailyBriefing,
  enabled: true,
});

export { generateDailyBriefing };
