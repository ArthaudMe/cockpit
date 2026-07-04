import type { ProviderDef } from "./provider-registry";
import { isProviderAuthError, providerLoginNeededMessage } from "./provider-auth";
import type { AgentRunFailureCategory } from "./agent-run-log";
import { redactSensitiveText, tailText } from "./agent-run-log";

export type AgentFailure = {
  category: AgentRunFailureCategory;
  title: string;
  message: string;
  details?: string;
};

type FailureInput = {
  provider?: ProviderDef;
  output: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  timedOut?: boolean;
  spawnError?: Error;
};

export function classifyAgentFailure(input: FailureInput): AgentFailure {
  const providerLabel = input.provider?.label ?? "AI backend";
  const normalized = `${input.output}\n${input.spawnError?.message ?? ""}`.toLowerCase();
  const details = cleanedDetails(input.output || input.spawnError?.message || "");

  if (input.provider && isProviderAuthError(input.provider, normalized)) {
    return {
      category: "auth",
      title: `${providerLabel} is not logged in`,
      message: providerLoginNeededMessage(input.provider),
      details,
    };
  }

  if (input.timedOut || includesAny(normalized, ["timed out", "timeout", "signal sigterm"])) {
    return {
      category: "timeout",
      title: `${providerLabel} timed out`,
      message: `${providerLabel} did not finish this turn before Cockpit's timeout. Try again, or shorten the request.`,
      details,
    };
  }

  if (includesAny(normalized, ["enoent", "command not found", "not found on path", "no such file or directory"])) {
    return {
      category: "missing_binary",
      title: `${providerLabel} is not available`,
      message: `${providerLabel} could not be started from Cockpit's PATH. Reinstall it or open Cockpit from an environment where the CLI is available.`,
      details,
    };
  }

  if (includesAny(normalized, ["unknown model", "invalid model", "model is unavailable", "model not found", "does not exist"])) {
    return {
      category: "invalid_model",
      title: "Selected model is unavailable",
      message: `${providerLabel} rejected the selected model. Pick another model in Settings and try again.`,
      details,
    };
  }

  if (includesAny(normalized, ["rate limit", "too many requests", "429", "quota", "exceeded your current quota", "usage limit"])) {
    return {
      category: "rate_limit",
      title: `${providerLabel} quota or rate limit reached`,
      message: `${providerLabel} refused the request because of a quota or rate limit. Wait a bit or switch provider/model.`,
      details,
    };
  }

  if (includesAny(normalized, ["econnreset", "etimedout", "enotfound", "eai_again", "connection refused", "could not resolve", "network error"])) {
    return {
      category: "network",
      title: `${providerLabel} network failure`,
      message: `${providerLabel} could not reach its service. Check the network connection and try again.`,
      details,
    };
  }

  if (includesAny(normalized, ["permission denied", "operation not permitted", "eacces", "sandbox"])) {
    return {
      category: "permission",
      title: `${providerLabel} permission failure`,
      message: `${providerLabel} was blocked by a permission or sandbox error.`,
      details,
    };
  }

  if (includesAny(normalized, ["mcp", "modelcontextprotocol"])) {
    return {
      category: "mcp",
      title: "MCP tool failure",
      message: "An MCP tool or server failed during this turn.",
      details,
    };
  }

  if (input.spawnError) {
    return {
      category: "spawn_error",
      title: `${providerLabel} could not start`,
      message: `${providerLabel} failed before Cockpit could send the prompt.`,
      details,
    };
  }

  if (details) {
    return {
      category: "provider_error",
      title: `${providerLabel} failed`,
      message: `${providerLabel} exited before it could answer.`,
      details,
    };
  }

  return {
    category: "unknown",
    title: `${providerLabel} failed`,
    message: `${providerLabel} exited with code ${input.exitCode ?? "unknown"}${input.signal ? ` (${input.signal})` : ""}.`,
  };
}

export function formatAgentFailureForUser(failure: AgentFailure, runId: string): string {
  const lines = [
    `\n\n${failure.title}.`,
    failure.message,
    `Run ID: ${runId}.`,
  ];

  if (failure.details) {
    lines.push(`Details: ${failure.details}`);
  }

  return lines.join("\n");
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function cleanedDetails(output: string): string | undefined {
  const text = redactSensitiveText(tailText(output.trim(), 1_200));
  return text || undefined;
}
