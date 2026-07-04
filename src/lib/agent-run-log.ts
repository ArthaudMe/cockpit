import { appendFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";

const COCKPIT_DIR = join(homedir(), ".cockpit");
const RUNS_DIR = join(COCKPIT_DIR, "runs");
const MAX_TAIL_CHARS = 8_000;

const ARG_VALUE_FLAGS = new Set([
  "--append-system-prompt",
  "--system-prompt",
  "--system",
  "--image",
  "-c",
]);

export type AgentRunPhase = "started" | "completed" | "failed" | "spawn_error";

export type AgentRunFailureCategory =
  | "auth"
  | "missing_binary"
  | "invalid_model"
  | "rate_limit"
  | "network"
  | "timeout"
  | "permission"
  | "mcp"
  | "provider_error"
  | "spawn_error"
  | "unknown";

export type AgentRunRecord = {
  runId: string;
  phase: AgentRunPhase;
  timestamp: string;
  agentId: string;
  backend?: string;
  providerLabel?: string;
  model?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  pid?: number;
  usedWarmProcess?: boolean;
  promptChars?: number;
  promptBytes?: number;
  focusContextChars?: number;
  imageCount?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  durationMs?: number;
  stdoutTail?: string;
  stderrTail?: string;
  eventErrorTail?: string;
  responseTail?: string;
  errorCategory?: AgentRunFailureCategory;
  userMessage?: string;
  build?: {
    appVersion: string;
    gitCommit: string;
  };
};

export function createAgentRunId(): string {
  return `run_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function tailText(text: string, maxChars = MAX_TAIL_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.slice(text.length - maxChars);
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/\b(authorization\s*[:=]\s*)(?:Bearer\s+)?[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .replace(
      /\b([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_-]*\s*[:=]\s*)["']?[^"'\s&]+/gi,
      "$1[redacted]",
    )
    .replace(/\b((?:access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*)["']?[^"'\s&]+/gi, "$1[redacted]");
}

export function redactCommandArgs(args: string[]): string[] {
  const redacted: string[] = [];
  let redactNext = false;

  for (const arg of args) {
    if (redactNext) {
      redacted.push("[redacted]");
      redactNext = false;
      continue;
    }

    if (ARG_VALUE_FLAGS.has(arg)) {
      redacted.push(arg);
      redactNext = true;
      continue;
    }

    if (/^(developer_instructions|base_instructions|system_prompt)=/.test(arg)) {
      redacted.push(arg.replace(/=.*/, "=[redacted]"));
      continue;
    }

    redacted.push(redactSensitiveText(arg));
  }

  return redacted;
}

export function getAgentRunLogPath(date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  return join(RUNS_DIR, day, "agent-runs.jsonl");
}

export function appendAgentRunLog(record: AgentRunRecord): void {
  try {
    const logPath = getAgentRunLogPath(new Date(record.timestamp));
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, `${JSON.stringify(redactRunRecord(record))}\n`, { mode: 0o600 });
  } catch (err) {
    console.error("[agent-run-log] failed to append run log:", err);
  }
}

export function getBuildInfo() {
  return {
    appVersion: process.env.npm_package_version || "unknown",
    gitCommit:
      process.env.COCKPIT_BUILD_COMMIT ||
      process.env.GITHUB_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "unknown",
  };
}

function redactRunRecord(record: AgentRunRecord): AgentRunRecord {
  return {
    ...record,
    args: record.args ? redactCommandArgs(record.args) : undefined,
    stdoutTail: record.stdoutTail ? redactSensitiveText(tailText(record.stdoutTail)) : undefined,
    stderrTail: record.stderrTail ? redactSensitiveText(tailText(record.stderrTail)) : undefined,
    eventErrorTail: record.eventErrorTail ? redactSensitiveText(tailText(record.eventErrorTail)) : undefined,
    responseTail: record.responseTail ? redactSensitiveText(tailText(record.responseTail)) : undefined,
    userMessage: record.userMessage ? redactSensitiveText(record.userMessage) : undefined,
  };
}
