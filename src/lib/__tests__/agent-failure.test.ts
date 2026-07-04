import { describe, expect, it } from "vitest";
import { classifyAgentFailure, formatAgentFailureForUser } from "../agent-failure";
import { PROVIDERS } from "../provider-registry";

describe("agent-failure", () => {
  it("classifies provider auth failures", () => {
    const failure = classifyAgentFailure({
      provider: PROVIDERS.claude,
      output: "Error: not authenticated",
      exitCode: 1,
    });

    expect(failure.category).toBe("auth");
    expect(failure.message).toContain("claude auth login");
  });

  it("classifies invalid model failures", () => {
    const failure = classifyAgentFailure({
      provider: PROVIDERS.codex,
      output: "unknown model: gpt-missing",
      exitCode: 1,
    });

    expect(failure.category).toBe("invalid_model");
    expect(failure.message).toContain("Pick another model");
  });

  it("classifies rate limit failures", () => {
    const failure = classifyAgentFailure({
      provider: PROVIDERS.claude,
      output: "429 too many requests: rate limit exceeded",
      exitCode: 1,
    });

    expect(failure.category).toBe("rate_limit");
  });

  it("classifies timed out turns", () => {
    const failure = classifyAgentFailure({
      provider: PROVIDERS.claude,
      output: "",
      timedOut: true,
      signal: "SIGTERM",
    });

    expect(failure.category).toBe("timeout");
  });

  it("formats user-facing failures with a run id and redacted details", () => {
    const failure = classifyAgentFailure({
      provider: PROVIDERS.codex,
      output: "provider crashed with OPENAI_API_KEY=sk-abcdefghijklmnop",
      exitCode: 1,
    });

    const message = formatAgentFailureForUser(failure, "run_123");
    expect(message).toContain("Run ID: run_123");
    expect(message).toContain("OPENAI_API_KEY=[redacted]");
    expect(message).not.toContain("sk-abcdefghijklmnop");
  });
});
