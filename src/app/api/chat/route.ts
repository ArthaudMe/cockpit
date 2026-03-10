import { NextRequest } from "next/server";
import { spawn } from "child_process";
import { getContextAsync, buildSystemPrompt } from "@/lib/context";
import { addMessage, getMessages } from "@/lib/db/messages";

export const maxDuration = 300;

type ChatMessage = { role: "user" | "assistant"; content: string };

function formatHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) return "";

  const historyLines = messages.map((m) => {
    const prefix = m.role === "user" ? "User" : "Assistant";
    // Truncate long messages in history to save prompt space
    const content =
      m.content.length > 2000
        ? m.content.slice(0, 2000) + "... [truncated]"
        : m.content;
    return `${prefix}: ${content}`;
  });

  return `\n\n## Conversation History\nThis is the ongoing conversation. Use this context for follow-up questions:\n\n${historyLines.join("\n\n")}`;
}

export async function POST(req: NextRequest) {
  const { message, focusContext, conversationId } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  const ctx = await getContextAsync();
  let systemPrompt = buildSystemPrompt(ctx);

  if (focusContext && typeof focusContext === "string") {
    systemPrompt += `\n\n## Current Focus Context\nThe user is currently looking at a specific section of their cockpit. Here is the focused context:\n\n${focusContext}\n\nAnswer questions with this focus in mind. Be specific and actionable.`;
  }

  // Include conversation history for multi-turn
  if (conversationId) {
    const dbMessages = getMessages(conversationId);
    const history: ChatMessage[] = dbMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    systemPrompt += formatHistory(history);

    // Store user message
    addMessage(conversationId, "user", message, focusContext);
  }

  const encoder = new TextEncoder();
  let fullResponse = "";

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
        },
      );

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        fullResponse += text;
        controller.enqueue(encoder.encode(text));
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        console.error("[claude stderr]", chunk.toString());
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          const errMsg = `\n\n[Process exited with code ${code}]`;
          fullResponse += errMsg;
          controller.enqueue(encoder.encode(errMsg));
        }

        // Store assistant response
        if (conversationId && fullResponse) {
          addMessage(conversationId, "assistant", fullResponse);
        }

        controller.close();
      });

      proc.on("error", (err) => {
        console.error("[claude spawn error]", err);
        const errMsg = `Error: Could not connect to Claude CLI. Run \`claude\` in your terminal first to authenticate.`;
        fullResponse += errMsg;
        controller.enqueue(encoder.encode(errMsg));

        if (conversationId && fullResponse) {
          addMessage(conversationId, "assistant", fullResponse);
        }

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
