import { getAgent, sendToAgent } from "./agent-manager";
import { AgentOutputParser } from "./agent-output";
import { extractAndProcessMemories } from "./memory";
import { extractAndProcessSkills } from "./skills-extract";
import { persistMessage } from "./knowledge/conversations";
import { getProvider } from "./provider-registry";
import { isProviderAuthError, providerLoginNeededMessage } from "./provider-auth";

/**
 * Send a message to an agent and stream the CLI process output as a
 * plain-text HTTP response. Shared by the main agent chat route and the
 * focus-view chat route so there is exactly one chat engine.
 */
export function streamAgentResponse(
  agentId: string,
  opts: { message: string; focusContext?: string; images?: string[] },
): Response {
  const { message, focusContext, images } = opts;
  const agent = getAgent(agentId);
  const provider = agent ? getProvider(agent.backend) : undefined;
  const encoder = new TextEncoder();
  const outputParser = new AgentOutputParser(provider?.capabilities.output.kind ?? "plain-text");
  const proc = sendToAgent(agentId, message, focusContext, images);

  let responseText = "";
  let stderrText = "";
  let eventErrorText = "";

  const stream = new ReadableStream({
    start(controller) {
      proc.stdout!.on("data", (chunk: Buffer) => {
        for (const parsed of outputParser.push(chunk.toString())) {
          if (parsed.kind === "assistant_delta") {
            responseText += parsed.text;
            controller.enqueue(encoder.encode(parsed.text));
          } else {
            eventErrorText += parsed.text;
            stderrText += parsed.text;
            console.error(`[agent:${agentId}:event-error]`, parsed.text);
          }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        stderrText += text;
        console.error(`[agent:${agentId}:stderr]`, text);
      });

      proc.on("close", (code) => {
        for (const parsed of outputParser.flush()) {
          if (parsed.kind === "assistant_delta") {
            responseText += parsed.text;
            controller.enqueue(encoder.encode(parsed.text));
          } else {
            eventErrorText += parsed.text;
            stderrText += parsed.text;
            console.error(`[agent:${agentId}:event-error]`, parsed.text);
          }
        }

        if (code !== 0) {
          const combined = (responseText + stderrText + eventErrorText).toLowerCase();
          if (provider && isProviderAuthError(provider, combined)) {
            if (provider.auth?.loginRoute) {
              fetch(`http://localhost:${process.env.PORT || "3939"}${provider.auth.loginRoute}`, {
                method: "POST",
              }).catch(() => {});
            }
            const loginMessage = `\n\n${providerLoginNeededMessage(provider)}`;
            responseText += loginMessage;
            controller.enqueue(encoder.encode(loginMessage));
          } else if (eventErrorText.trim()) {
            const eventMessage = `\n\n${eventErrorText.trim()}`;
            responseText += eventMessage;
            controller.enqueue(encoder.encode(eventMessage));
          } else {
            const failureMessage = "\n\nSomething went wrong. Please try sending your message again.";
            responseText += failureMessage;
            controller.enqueue(encoder.encode(failureMessage));
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
        console.error(`[agent:${agentId}:error]`, err);
        const backendLabel = provider?.label ?? "AI backend";
        controller.enqueue(
          encoder.encode(`Couldn't connect to ${backendLabel}. Please check that it is installed and try again.`),
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
