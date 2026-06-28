import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMcpServerEnv } from "../mcp";

describe("buildMcpServerEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      HOME: "/Users/test",
      PATH: "/usr/bin",
      NODE_ENV: "test",
      OPENAI_API_KEY: "sk-test",
      DATABASE_URL: "postgres://secret",
      LD_PRELOAD: "bad-process-value",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses the spawned-agent allowlist instead of inheriting the full process env", () => {
    const env = buildMcpServerEnv({ CUSTOM_MCP_KEY: "value" });

    expect(env.HOME).toBe("/Users/test");
    expect(env.OPENAI_API_KEY).toBe("sk-test");
    expect(env.CUSTOM_MCP_KEY).toBe("value");
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("filters dangerous user-configured env overrides", () => {
    const env = buildMcpServerEnv({
      DYLD_INSERT_LIBRARIES: "bad",
      NODE_OPTIONS: "--require bad",
      SAFE_SETTING: "ok",
    });

    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.SAFE_SETTING).toBe("ok");
  });
});
