import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../provider-registry";
import { isProviderAuthError, providerLoginNeededMessage } from "../provider-auth";

describe("provider-auth", () => {
  it("detects Codex login failures and returns an actionable command", () => {
    expect(isProviderAuthError(PROVIDERS.codex, "Error: login required")).toBe(true);
    expect(providerLoginNeededMessage(PROVIDERS.codex)).toContain("codex login");
  });

  it("detects Claude login failures and mentions the sign-in flow fallback", () => {
    expect(isProviderAuthError(PROVIDERS.claude, "Please run /login")).toBe(true);
    expect(providerLoginNeededMessage(PROVIDERS.claude)).toContain("Cockpit sign-in flow");
    expect(providerLoginNeededMessage(PROVIDERS.claude)).toContain("claude auth login");
  });

  it("does not classify unrelated failures as auth errors", () => {
    expect(isProviderAuthError(PROVIDERS.codex, "model is unavailable")).toBe(false);
  });
});
