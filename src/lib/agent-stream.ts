import { getAgent, sendToAgent } from "./agent-manager";
import { AgentOutputParser, type AgentOutputChunk } from "./agent-output";
import { extractAndProcessMemories } from "./memory";
import { extractAndProcessSkills } from "./skills-extract";
import { persistMessage } from "./knowledge/conversations";
import { getProvider } from "./provider-registry";
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
// Grace period between SIGTERM and SIGKILL when force-stopping a CLI process.
const KILL_GRACE_MS = 3_000;

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
  // The synthetic failure message we append to responseText for the user; kept
  // separate so it can be excluded from persisted conversation history.
  let failureSuffix = "";

  // SIGTERM the CLI, then escalate to SIGKILL if it has not exited after a
  // short grace period. Used by the turn timeout and by stream cancellation.
  const killProc = (grace = KILL_GRACE_MS) => {
    try {
      proc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    const graceTimer = setTimeout(() => {
      try {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }, grace);
    graceTimer.unref?.();
  };

  appendRunLog("started", startedAt);

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Stream was cancelled/closed by the client — nothing to enqueue to.
        }
      };
      const safeClose = () => {
        try {
          controller.close();
        } catch {
          // Already closed (e.g. after cancel).
        }
      };
      const handleParsed = (parsed: AgentOutputChunk) => {
        if (parsed.kind === "assistant_delta") {
          responseText += parsed.text;
          safeEnqueue(parsed.text);
        } else if (parsed.kind === "assistant_replace") {
          // The parser rewound and re-sent the full message; drop the prefix we
          // already streamed and only send the diverging tail.
          const common = commonPrefixLength(responseText, parsed.text);
          if (parsed.text.length > common) safeEnqueue(parsed.text.slice(common));
          responseText = parsed.text;
        } else {
          eventErrorText += parsed.text;
          stderrText += parsed.text;
          console.error(`[agent:${agentId}:event-error]`, parsed.text);
        }
      };

      const turnTimeout = setTimeout(() => {
        timedOut = true;
        console.error("[agent:%s] turn timed out after %dms", agentId, resolveAgentTurnTimeoutMs());
        killProc();
      }, resolveAgentTurnTimeoutMs());

      proc.stdout!.on("data", (chunk: Buffer) => {
        const raw = chunk.toString();
        stdoutText = tailText(stdoutText + raw);
        for (const parsed of outputParser.push(raw)) handleParsed(parsed);
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
        for (const parsed of outputParser.flush()) handleParsed(parsed);

        let failureCategory: AgentRunFailureCategory | undefined;
        let userFailureMessage: string | undefined;

        if (code !== 0) {
          const combined = [responseText, stdoutText, stderrText, eventErrorText].filter(Boolean).join("\n");
          const failure = classifyAgentFailure({
            provider,
            output: combined,
            stderr: [stderrText, eventErrorText].filter(Boolean).join("\n"),
            exitCode: code,
            signal,
            timedOut,
          });
          failureCategory = failure.category;

          // Only kick off a login flow when the failure is structurally an auth
          // failure — not merely because the model quoted an auth phrase.
          if (failure.category === "auth" && provider?.auth?.loginRoute) {
            fetch(`http://localhost:${process.env.PORT || "3939"}${provider.auth.loginRoute}`, {
              method: "POST",
            }).catch(() => {});
          }

          userFailureMessage = formatAgentFailureForUser(failure, runId);
          failureSuffix = userFailureMessage;
          responseText += userFailureMessage;
          safeEnqueue(userFailureMessage);
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

        safeClose();

        // Model output without the synthetic failure suffix we appended above.
        const assistantText = failureSuffix
          ? responseText.slice(0, responseText.length - failureSuffix.length)
          : responseText;
        let cleanedAssistant = assistantText;

        // Fire-and-forget: extract and process memory + skill commands
        if (assistantText) {
          try {
            const { cleanedText, processed } = extractAndProcessMemories(assistantText);
            cleanedAssistant = cleanedText ?? assistantText;
            if (processed.length > 0) {
              console.log("[agent:%s] processed %d memory commands", agentId, processed.length);
            }
          } catch (err) {
            console.error("[agent:%s] memory extraction error:", agentId, err);
          }

          try {
            const { processed: skillResults } = extractAndProcessSkills(assistantText);
            if (skillResults.length > 0) {
              console.log("[agent:%s] processed %d skill commands", agentId, skillResults.length);
            }
          } catch (err) {
            console.error("[agent:%s] skill extraction error:", agentId, err);
          }
        }

        // Fire-and-forget: persist conversation to history. Store the cleaned
        // text (memory blocks stripped, failure boilerplate excluded) so it is
        // not replayed into later prompts.
        try {
          const ts = new Date().toISOString();
          if (message) {
            persistMessage({ role: "user", content: message, timestamp: ts, agentId });
          }
          if (cleanedAssistant) {
            persistMessage({ role: "assistant", content: cleanedAssistant, timestamp: ts, agentId });
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
          stderr: [stderrText, eventErrorText].filter(Boolean).join("\n"),
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
        safeEnqueue(failureMessage);
        safeClose();
      });
    },
    cancel() {
      // Client disconnected — stop the CLI so we do not burn tokens on a
      // response nobody is reading.
      killProc();
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

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}
