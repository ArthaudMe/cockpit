import { describe, expect, it } from "vitest";
import {
  getAgentRunLogPath,
  redactCommandArgs,
  redactSensitiveText,
  tailText,
} from "../agent-run-log";

describe("agent-run-log", () => {
  it("redacts sensitive command arguments", () => {
    expect(redactCommandArgs([
      "-p",
      "--append-system-prompt",
      "private system prompt",
      "-c",
      "developer_instructions=\"private\"",
      "--model",
      "claude-sonnet",
    ])).toEqual([
      "-p",
      "--append-system-prompt",
      "[redacted]",
      "-c",
      "[redacted]",
      "--model",
      "claude-sonnet",
    ]);
  });

  it("redacts common secret values from log text", () => {
    const redacted = redactSensitiveText(
      "Authorization: Bearer abc.def API_KEY=secret OPENAI_API_KEY=sk-abcdefghijklmnop",
    );

    expect(redacted).toContain("Authorization: [redacted]");
    expect(redacted).toContain("API_KEY=[redacted]");
    expect(redacted).toContain("OPENAI_API_KEY=[redacted]");
    expect(redacted).not.toContain("abc.def");
    expect(redacted).not.toContain("Bearer abc");
    expect(redacted).not.toContain("sk-abcdefghijklmnop");
  });

  it("returns bounded text tails", () => {
    expect(tailText("abcdef", 3)).toBe("def");
    expect(tailText("abc", 5)).toBe("abc");
  });

  it("places run logs under a dated cockpit runs path", () => {
    const path = getAgentRunLogPath(new Date("2026-07-04T12:00:00Z"));
    expect(path).toContain(".cockpit");
    expect(path).toContain("runs");
    expect(path).toContain("2026-07-04");
    expect(path.endsWith("agent-runs.jsonl")).toBe(true);
  });
});
