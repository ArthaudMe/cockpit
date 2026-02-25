import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { getContext, buildSystemPrompt } from "@/lib/context";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { message, focusContext } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  const ctx = getContext();
  let systemPrompt = buildSystemPrompt(ctx);

  if (focusContext && typeof focusContext === "string") {
    systemPrompt += `\n\n## Current Focus Context\nThe user is currently looking at a specific section of their cockpit. Here is the focused context:\n\n${focusContext}\n\nAnswer questions with this focus in mind. Be specific and actionable.`;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(
        "claude",
        [
          "-p",
          "--output-format",
          "text",
          "--append-system-prompt",
          systemPrompt,
          message,
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env,
        }
      );

      proc.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(encoder.encode(chunk.toString()));
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        console.error("[claude stderr]", chunk.toString());
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(`\n\n[Process exited with code ${code}]`)
          );
        }
        controller.close();
      });

      proc.on("error", (err) => {
        console.error("[claude spawn error]", err);
        controller.enqueue(
          encoder.encode(
            `Error: Could not connect to Claude CLI. Run \`claude\` in your terminal first to authenticate.`
          )
        );
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
