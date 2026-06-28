import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  getProviderDefs,
  isProviderId,
  isProviderModel,
  listProviders,
  providerSupportsImages,
  providerSupportsPrewarm,
  providerUsesClaudeHooks,
} from "../provider-registry";

describe("provider-registry", () => {
  it("has exactly the supported providers", () => {
    expect(PROVIDERS.claude).toBeDefined();
    expect(PROVIDERS.codex).toBeDefined();
    expect(PROVIDERS.ollama).toBeDefined();
    expect(Object.keys(PROVIDERS)).toHaveLength(3);
  });

  it("each provider has required fields", () => {
    for (const [id, def] of Object.entries(PROVIDERS)) {
      expect(def.id).toBe(id);
      expect(def.label).toBeTruthy();
      expect(def.binary).toBeTruthy();
      expect(def.versionArgs).toBeInstanceOf(Array);
      expect(def.installHint).toBeTruthy();
      expect(def.models).toBeInstanceOf(Array);
      expect(def.models.length).toBeGreaterThan(0);
      expect(def.defaultModel).toBeTruthy();
      expect(typeof def.buildArgs).toBe("function");
      expect(typeof def.supportsPrewarm).toBe("boolean");
      expect(def.capabilities).toBeDefined();
      expect(def.capabilities.install.hint).toBe(def.installHint);
      expect(def.capabilities.models.defaultModel).toBe(def.defaultModel);
      expect(def.capabilities.models.options).toBe(def.models);
      if (def.auth) {
        expect(def.auth.loginCommand).toBeTruthy();
        expect(def.auth.unauthenticatedMatchers.length).toBeGreaterThan(0);
      }
    }
  });

  it("claude provider builds correct args", () => {
    const claude = PROVIDERS.claude;
    const args = claude.buildArgs("claude-sonnet-4-20250514", "You are helpful.");
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("text");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("You are helpful.");
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-4-20250514");
  });

  it("claude provider builds args with images", () => {
    const claude = PROVIDERS.claude;
    const args = claude.buildArgs("claude-sonnet-4-20250514", "sys", {
      images: ["/tmp/img1.png", "/tmp/img2.jpg"],
    });
    // Should have two --image flags
    const imageFlags = args.filter((a: string) => a === "--image");
    expect(imageFlags).toHaveLength(2);
    expect(args).toContain("/tmp/img1.png");
    expect(args).toContain("/tmp/img2.jpg");
  });

  it("claude supports prewarm", () => {
    expect(providerSupportsPrewarm(PROVIDERS.claude)).toBe(true);
  });

  it("ollama does not support prewarm", () => {
    expect(providerSupportsPrewarm(PROVIDERS.ollama)).toBe(false);
  });

  it("ollama forwards the system prompt", () => {
    const ollama = PROVIDERS.ollama;
    const args = ollama.buildArgs("llama3.3", "Be useful.");
    expect(args).toEqual(["run", "llama3.3", "--system", "Be useful."]);
  });

  it("getProviderDefs returns all providers as array", () => {
    const defs = getProviderDefs();
    expect(defs).toBeInstanceOf(Array);
    expect(defs.length).toBe(Object.keys(PROVIDERS).length);
    const ids = defs.map((d) => d.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
  });

  it("listProviders returns full provider objects", () => {
    const list = listProviders();
    expect(list.length).toBe(Object.keys(PROVIDERS).length);
    // Full objects include binary, buildArgs, etc.
    expect(list[0].binary).toBeDefined();
    expect(list[0].buildArgs).toBeDefined();
  });

  it("getProviderDefs returns lightweight subset", () => {
    const defs = getProviderDefs();
    expect(defs.length).toBe(Object.keys(PROVIDERS).length);
    // Should have basic fields
    expect(defs[0].id).toBeDefined();
    expect(defs[0].label).toBeDefined();
    expect(defs[0].models).toBeDefined();
    expect(defs[0].capabilities).toBeDefined();
    // Should NOT have implementation details
    expect((defs[0] as any).binary).toBeUndefined();
    expect((defs[0] as any).buildArgs).toBeUndefined();
  });

  it("codex builds correct args", () => {
    const codex = PROVIDERS.codex;
    const args = codex.buildArgs("o4-mini", "Be concise.");
    expect(args).toContain("exec");
    expect(args).toContain("--json");
    expect(args).toContain("--model");
    expect(args).toContain("o4-mini");
    expect(args).toContain("--skip-git-repo-check");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("-c");
    expect(args).toContain("developer_instructions=\"Be concise.\"");
    expect(args[args.length - 1]).toBe("-");
  });

  it("each provider default model is in its models list", () => {
    for (const def of getProviderDefs()) {
      const modelIds = def.models.map((m) => m.id);
      expect(modelIds).toContain(def.defaultModel);
    }
  });

  it("exposes explicit provider capabilities", () => {
    expect(PROVIDERS.claude.capabilities.lifecycle.hooks).toEqual({ kind: "claude-workspace" });
    expect(providerUsesClaudeHooks(PROVIDERS.claude)).toBe(true);
    expect(providerSupportsImages(PROVIDERS.claude)).toBe(true);

    expect(PROVIDERS.codex.capabilities.lifecycle.hooks).toEqual({ kind: "none" });
    expect(providerUsesClaudeHooks(PROVIDERS.codex)).toBe(false);
    expect(providerSupportsImages(PROVIDERS.codex)).toBe(false);
    expect(PROVIDERS.codex.auth?.loginCommand).toBe("codex login");
    expect(PROVIDERS.codex.capabilities.output).toEqual({ kind: "codex-jsonl" });

    expect(PROVIDERS.ollama.capabilities.prompt.systemPrompt).toEqual({
      kind: "ollama-system-flag",
    });
  });

  it("validates provider ids and provider-specific models", () => {
    expect(isProviderId("claude")).toBe(true);
    expect(isProviderId("missing")).toBe(false);
    expect(isProviderModel("claude", PROVIDERS.claude.defaultModel)).toBe(true);
    expect(isProviderModel("claude", "llama3.3")).toBe(false);
    expect(isProviderModel("missing", "anything")).toBe(false);
  });
});
