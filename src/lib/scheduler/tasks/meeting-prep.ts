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
      console.error("[meeting-prep/claude stderr]", chunk.toString());
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

async function generateMeetingPreps(): Promise<void> {
  const ctx = await getContextAsync();
  const systemContext = buildSystemPrompt(ctx);

  // Find meetings happening in the next 30 minutes
  const now = new Date();
  const upcoming = ctx.calendar.filter((meeting) => {
    // Parse time like "10:00 AM", "3:00 PM"
    const match = meeting.time.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return false;

    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = match[3].toUpperCase();

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const meetingTime = new Date(now);
    meetingTime.setHours(hours, mins, 0, 0);

    const diffMs = meetingTime.getTime() - now.getTime();
    // Between 0 and 30 minutes from now
    return diffMs > 0 && diffMs <= 30 * 60 * 1000;
  });

  for (const meeting of upcoming) {
    const prompt = `${systemContext}

---

Prepare a brief for the upcoming meeting: "${meeting.title}" at ${meeting.time} (${meeting.duration}) with ${meeting.attendees.join(", ")}.

Include:
1. **Context** — What is this meeting about? What's the background?
2. **Key Points** — What should ${ctx.user} bring up?
3. **Open Questions** — What decisions need to be made?
4. **Prep Notes** — Any relevant data points or updates

Keep it under 300 words. Be specific and actionable.`;

    const content = await runClaudePrompt(prompt);

    createBriefing({
      type: "meeting-prep",
      content,
      metadata: {
        meeting: meeting.title,
        time: meeting.time,
        attendees: meeting.attendees,
      },
    });
  }
}

// Register: runs every 15 minutes during work hours
registerTask({
  name: "meeting-prep",
  schedule: "*/15 8-18 * * 1-5",
  handler: generateMeetingPreps,
  enabled: true,
});

export { generateMeetingPreps };
