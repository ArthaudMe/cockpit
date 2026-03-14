import { NextRequest } from "next/server";
import { sendToAgent, getAgent } from "@/lib/agent-manager";

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

  const { message, focusContext } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("Missing message", { status: 400 });
  }

  const encoder = new TextEncoder();

  try {
    const proc = sendToAgent(id, message, focusContext);

    const stream = new ReadableStream({
      start(controller) {
        proc.stdout!.on("data", (chunk: Buffer) => {
          controller.enqueue(encoder.encode(chunk.toString()));
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
