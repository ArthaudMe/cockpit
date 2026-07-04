import { getAgent, sendToAgent } from "./agent-manager";
import { AgentOutputParser } from "./agent-output";
import { extractAndProcessMemories } from "./memory";
import { extractAndProcessSkills } from "./skills-extract";
import { persistMessage } from "./knowledge/conversations";
import { getProvider } from "./provider-registry";
import { isProviderAuthError } from "./provider-auth";
import { classifyAgentFailure, formatAgentFailureForUser } from "./agent-failure";
import {
  appendAgentRunLog,
  createAgentRunId,
  getBuildInfo,
  tailText,
  type AgentRunFailureCategory,
  type AgentRunPhase,
} from "./agent-run-log";

const DEFAULT_AGENT_TURN_TIMEOUT_MS = 285_000;

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
  const runId = createAgentRunId();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const metadata = proc.cockpit;

  let responseText = "";
  let stdoutText = "";
  let stderrText = "";
  let eventErrorText = "";
  let timedOut = false;
  let finalized = false;

  appendRunLog("started", startedAt);

  const stream = new ReadableStream({
    start(controller) {
      const turnTimeout = setTimeout(() => {
        timedOut = true;
        console.error("[agent:%s] turn timed out after %dms", agentId, resolveAgentTurnTimeoutMs());
        proc.kill("SIGTERM");
      }, resolveAgentTurnTimeoutMs());

      proc.stdout!.on("data", (chunk: Buffer) => {
        const raw = chunk.toString();
        stdoutText = tailText(stdoutText + raw);
        for (const parsed of outputParser.push(raw)) {
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
        stderrText = tailText(stderrText + text);
        console.error(`[agent:${agentId}:stderr]`, text);
      });

      proc.on("close", (code, signal) => {
        if (finalized) return;
        finalized = true;
        clearTimeout(turnTimeout);
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

        let failureCategory: AgentRunFailureCategory | undefined;
        let userFailureMessage: string | undefined;

        if (code !== 0) {
          const combined = [responseText, stdoutText, stderrText, eventErrorText].filter(Boolean).join("\n");
          const failure = classifyAgentFailure({
            provider,
            output: combined,
            exitCode: code,
            signal,
            timedOut,
          });
          failureCategory = failure.category;

          if (provider && isProviderAuthError(provider, combined)) {
            if (provider.auth?.loginRoute) {
              fetch(`http://localhost:${process.env.PORT || "3939"}${provider.auth.loginRoute}`, {
                method: "POST",
              }).catch(() => {});
            }
          }

          userFailureMessage = formatAgentFailureForUser(failure, runId);
          responseText += userFailureMessage;
          controller.enqueue(encoder.encode(userFailureMessage));
        }

        appendRunLog(code === 0 ? "completed" : "failed", new Date().toISOString(), {
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAtMs,
          stdoutTail: stdoutText,
          stderrTail: stderrText,
          eventErrorTail: eventErrorText,
          responseTail: responseText,
          errorCategory: failureCategory,
          userMessage: userFailureMessage,
        });

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
        if (finalized) return;
        finalized = true;
        clearTimeout(turnTimeout);
        console.error(`[agent:${agentId}:error]`, err);
        const failure = classifyAgentFailure({
          provider,
          output: [stdoutText, stderrText, eventErrorText].filter(Boolean).join("\n"),
          spawnError: err,
        });
        const failureMessage = formatAgentFailureForUser(failure, runId);
        responseText += failureMessage;
        appendRunLog("spawn_error", new Date().toISOString(), {
          durationMs: Date.now() - startedAtMs,
          stdoutTail: stdoutText,
          stderrTail: stderrText,
          eventErrorTail: eventErrorText,
          responseTail: responseText,
          errorCategory: failure.category,
          userMessage: failureMessage,
        });
        controller.enqueue(encoder.encode(failureMessage));
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

  function appendRunLog(
    phase: AgentRunPhase,
    timestamp: string,
    extra?: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      durationMs?: number;
      stdoutTail?: string;
      stderrTail?: string;
      eventErrorTail?: string;
      responseTail?: string;
      errorCategory?: AgentRunFailureCategory;
      userMessage?: string;
    },
  ) {
    appendAgentRunLog({
      runId,
      phase,
      timestamp,
      agentId,
      backend: metadata?.backend ?? agent?.backend,
      providerLabel: metadata?.providerLabel ?? provider?.label,
      model: metadata?.model ?? agent?.model,
      command: metadata?.command,
      args: metadata?.args,
      cwd: metadata?.cwd,
      pid: proc.pid,
      usedWarmProcess: metadata?.usedWarmProcess,
      promptChars: metadata?.promptChars,
      promptBytes: metadata?.promptBytes,
      focusContextChars: metadata?.focusContextChars,
      imageCount: metadata?.imageCount,
      build: getBuildInfo(),
      ...extra,
    });
  }
}

function resolveAgentTurnTimeoutMs(): number {
  const configured = Number(process.env.COCKPIT_AGENT_TURN_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return DEFAULT_AGENT_TURN_TIMEOUT_MS;
}
