import { NextRequest } from "next/server";
import { send } from "@/lib/claude-pool";
import { extractAndProcessMemories } from "@/lib/memory";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { message, focusContext } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  const encoder = new TextEncoder();
  const proc = send(message, focusContext);

  let responseText = "";

  const stream = new ReadableStream({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        responseText += text;
        controller.enqueue(encoder.encode(text));
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        console.error("[chat:stderr]", chunk.toString());
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          controller.enqueue(
            encoder.encode(`\n\n[Process exited with code ${code}]`)
          );
        }
        controller.close();

        // Fire-and-forget: extract and process memory commands
        if (responseText) {
          try {
            const { processed } = extractAndProcessMemories(responseText);
            if (processed.length > 0) {
              console.log("[chat] processed %d memory commands", processed.length);
            }
          } catch (err) {
            console.error("[chat] memory extraction error:", err);
          }
        }
      });

      proc.on("error", (err) => {
        controller.enqueue(
          encoder.encode(`Error: ${err.message}`)
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
