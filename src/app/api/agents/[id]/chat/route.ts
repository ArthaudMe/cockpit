import { NextRequest } from "next/server";
import { sendToAgent, getAgent } from "@/lib/agent-manager";
import { extractAndProcessMemories } from "@/lib/memory";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return new Response("Agent not found", { status: 404 });
  }

  const { message, focusContext, images } = await req.json();
  if ((!message || typeof message !== "string") && (!images || !Array.isArray(images) || images.length === 0)) {
    return new Response("Missing message", { status: 400 });
  }

  const encoder = new TextEncoder();

  try {
    const proc = sendToAgent(id, message || "", focusContext, images);

    let responseText = "";

    const stream = new ReadableStream({
      start(controller) {
        proc.stdout!.on("data", (chunk: Buffer) => {
          const text = chunk.toString();
          responseText += text;
          controller.enqueue(encoder.encode(text));
        });

        proc.stderr!.on("data", (chunk: Buffer) => {
          console.error(`[agent:${id}:stderr]`, chunk.toString());
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
                console.log("[agent:%s] processed %d memory commands", id, processed.length);
              }
            } catch (err) {
              console.error("[agent:%s] memory extraction error:", id, err);
            }
          }
        });

        proc.on("error", (err) => {
          controller.enqueue(encoder.encode(`Error: ${err.message}`));
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
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Failed to send message",
      { status: 500 }
    );
  }
}
