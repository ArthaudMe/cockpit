import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildAgentEnv } from "../agent-env";

describe("buildAgentEnv", () => {
  const originalEnv = { ...process.env };
  const tempDirs: string[] = [];

  beforeEach(() => {
    // Set a known baseline
    process.env = {
      HOME: "/Users/test",
      PATH: "/usr/bin",
      USER: "test",
      SHELL: "/bin/zsh",
      NODE_ENV: "development",
      ANTHROPIC_API_KEY: "sk-ant-xxx",
      OPENAI_API_KEY: "sk-xxx",
      GITHUB_TOKEN: "ghp_xxx",
      // These should be stripped
      SOME_RANDOM_VAR: "should-not-appear",
      INTERNAL_SECRET: "should-not-appear",
      DATABASE_URL: "postgres://should-not-appear",
      CLAUDECODE: "should-be-removed",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("passes through allowed env vars", () => {
    const env = buildAgentEnv();
    expect(env.HOME).toBe("/Users/test");
    expect(env.PATH).toContain("/usr/bin");
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-xxx");
    expect(env.OPENAI_API_KEY).toBe("sk-xxx");
    expect(env.GITHUB_TOKEN).toBe("ghp_xxx");
    expect(env.NODE_ENV).toBe("development");
  });

  it("strips non-allowed env vars", () => {
    const env = buildAgentEnv();
    expect(env.SOME_RANDOM_VAR).toBeUndefined();
    expect(env.INTERNAL_SECRET).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("always strips CLAUDECODE", () => {
    const env = buildAgentEnv();
    expect(env.CLAUDECODE).toBeUndefined();
  });

  it("passes through COCKPIT_* prefixed vars", () => {
    process.env.COCKPIT_CUSTOM_FLAG = "yes";
    process.env.COCKPIT_SESSION_ID = "abc123";
    const env = buildAgentEnv();
    expect(env.COCKPIT_CUSTOM_FLAG).toBe("yes");
    expect(env.COCKPIT_SESSION_ID).toBe("abc123");
  });

  it("merges extra vars", () => {
    const env = buildAgentEnv({ EXTRA_KEY: "extra-value", ANOTHER: "val" });
    expect(env.EXTRA_KEY).toBe("extra-value");
    expect(env.ANOTHER).toBe("val");
    // Original allowed vars still present
    expect(env.HOME).toBe("/Users/test");
  });

  it("extra vars override env vars", () => {
    const env = buildAgentEnv({ HOME: "/override" });
    expect(env.HOME).toBe("/override");
  });

  it("adds real user-local CLI install locations to PATH", () => {
    const home = mkdtempSync(join(tmpdir(), "cockpit-home-"));
    tempDirs.push(home);
    mkdirSync(join(home, ".nvm", "versions", "node", "v24.13.0", "bin"), { recursive: true });
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    mkdirSync(join(home, ".bun", "bin"), { recursive: true });
    process.env.HOME = home;

    const env = buildAgentEnv();

    expect(env.PATH).toContain(join(home, ".nvm", "versions", "node", "v24.13.0", "bin"));
    expect(env.PATH).toContain(join(home, ".local", "bin"));
    expect(env.PATH).toContain(join(home, ".bun", "bin"));
  });

  it("returns an object usable as ProcessEnv (no undefined values)", () => {
    const env = buildAgentEnv();
    for (const val of Object.values(env)) {
      if (val !== undefined) {
        expect(typeof val).toBe("string");
      }
    }
  });
});
