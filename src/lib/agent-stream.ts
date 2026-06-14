import { sendToAgent } from "./agent-manager";
import { extractAndProcessMemories } from "./memory";
import { extractAndProcessSkills } from "./skills-extract";
import { persistMessage } from "./knowledge/conversations";

/**
 * Send a message to an agent and stream the CLI process output as a
 * plain-text HTTP response. Shared by the main agent chat route and the
 * focus-view chat route so there is exactly one chat engine.
 */
export function streamAgentResponse(
  agentId: string,
  opts: { message: string; focusContext?: string; images?: string[] }
): Response {
  const { message, focusContext, images } = opts;
  const encoder = new TextEncoder();
  const proc = sendToAgent(agentId, message, focusContext, images);

  let responseText = "";
  let stderrText = "";

  const stream = new ReadableStream({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        responseText += text;
        controller.enqueue(encoder.encode(text));
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrText += text;
        console.error(`[agent:${agentId}:stderr]`, text);
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          // Detect "not logged in" from Claude CLI
          const combined = (responseText + stderrText).toLowerCase();
          if (
            combined.includes("not logged in") ||
            combined.includes("please run /login") ||
            combined.includes("authentication")
          ) {
            // Trigger login flow automatically
            fetch("http://localhost:" + (process.env.PORT || "3939") + "/api/authenticate-claude", { method: "POST" }).catch(() => {});
            controller.enqueue(
              encoder.encode(
                `\n\n**Claude CLI is not authenticated.** A browser window should open for you to log in. If not, open Terminal and run \`claude login\`, then restart Cockpit.`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(`\n\n[Process exited with code ${code}]`)
            );
          }
        }
        controller.close();

        // Fire-and-forget: extract and process memory + skill commands
        if (responseText) {
          try {
            const { processed } = extractAndProcessMemories(responseText);
            if (processed.length > 0) {
              console.log("[agent:%s] processed %d memory commands", agentId, processed.length);
            }
          } catch (err) {
            console.error("[agent:%s] memory extraction error:", agentId, err);
          }

          try {
            const { processed: skillResults } = extractAndProcessSkills(responseText);
            if (skillResults.length > 0) {
              console.log("[agent:%s] processed %d skill commands", agentId, skillResults.length);
            }
          } catch (err) {
            console.error("[agent:%s] skill extraction error:", agentId, err);
          }
        }

        // Fire-and-forget: persist conversation to history
        try {
          const ts = new Date().toISOString();
          if (message) {
            persistMessage({ role: "user", content: message, timestamp: ts, agentId });
          }
          if (responseText) {
            persistMessage({ role: "assistant", content: responseText, timestamp: ts, agentId });
          }
        } catch {
          // Never let persistence failures affect the stream
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
}
