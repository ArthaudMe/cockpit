import { describe, it, expect } from "vitest";
import { PROVIDERS, getProviderDefs, listProviders } from "../provider-registry";

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
    expect(PROVIDERS.claude.supportsPrewarm).toBe(true);
  });

  it("ollama does not support prewarm", () => {
    expect(PROVIDERS.ollama.supportsPrewarm).toBe(false);
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
    // Should NOT have implementation details
    expect((defs[0] as any).binary).toBeUndefined();
    expect((defs[0] as any).buildArgs).toBeUndefined();
  });

  it("codex builds correct args", () => {
    const codex = PROVIDERS.codex;
    const args = codex.buildArgs("o4-mini", "Be concise.");
    expect(args).toContain("-q");
    expect(args).toContain("--model");
    expect(args).toContain("o4-mini");
    expect(args).toContain("--system-prompt");
  });

  it("each provider default model is in its models list", () => {
    for (const def of getProviderDefs()) {
      const modelIds = def.models.map((m) => m.id);
      expect(modelIds).toContain(def.defaultModel);
    }
  });
});
