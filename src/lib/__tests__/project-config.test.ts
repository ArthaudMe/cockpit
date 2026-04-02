import { describe, it, expect, afterEach } from "vitest";
import { loadProjectConfig, getProjectEnv, getProjectContext } from "../projects/config";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

describe("project-config", () => {
  const testDirs: string[] = [];

  function createTestDir(config?: object): string {
    const dir = join(tmpdir(), `cockpit-test-${randomBytes(4).toString("hex")}`);
    mkdirSync(dir, { recursive: true });
    testDirs.push(dir);

    if (config) {
      writeFileSync(join(dir, ".cockpit.json"), JSON.stringify(config, null, 2));
    }

    return dir;
  }

  afterEach(() => {
    for (const dir of testDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    }
    testDirs.length = 0;
  });

  it("returns null when no .cockpit.json exists", () => {
    const dir = createTestDir();
    const config = loadProjectConfig(dir);
    expect(config).toBeNull();
  });

  it("loads valid .cockpit.json", () => {
    const dir = createTestDir({
      setup: "pnpm install",
      run: "pnpm dev",
      env: { DATABASE_URL: "postgres://localhost/test" },
    });

    const config = loadProjectConfig(dir);
    expect(config).not.toBeNull();
    expect(config!.setup).toBe("pnpm install");
    expect(config!.run).toBe("pnpm dev");
    expect(config!.env).toEqual({ DATABASE_URL: "postgres://localhost/test" });
  });

  it("returns null for invalid JSON", () => {
    const dir = createTestDir();
    writeFileSync(join(dir, ".cockpit.json"), "not valid json{{{");
    const config = loadProjectConfig(dir);
    expect(config).toBeNull();
  });

  it("loads all config fields", () => {
    const dir = createTestDir({
      setup: "make setup",
      teardown: "make teardown",
      run: "make run",
      stop: "make stop",
      env: { FOO: "bar" },
      preserve: [".env", "node_modules"],
      shell: "bash",
      context: "This is a React project",
    });

    const config = loadProjectConfig(dir);
    expect(config!.setup).toBe("make setup");
    expect(config!.teardown).toBe("make teardown");
    expect(config!.run).toBe("make run");
    expect(config!.stop).toBe("make stop");
    expect(config!.env).toEqual({ FOO: "bar" });
    expect(config!.preserve).toEqual([".env", "node_modules"]);
    expect(config!.shell).toBe("bash");
    expect(config!.context).toBe("This is a React project");
  });

  it("getProjectEnv returns env from config", () => {
    const dir = createTestDir({
      env: { API_KEY: "secret", PORT: "8080" },
    });

    const env = getProjectEnv(dir);
    expect(env).toEqual({ API_KEY: "secret", PORT: "8080" });
  });

  it("getProjectEnv returns undefined when no config", () => {
    const dir = createTestDir();
    const env = getProjectEnv(dir);
    expect(env).toBeUndefined();
  });

  it("getProjectContext returns context string", () => {
    const dir = createTestDir({
      context: "A Python data pipeline project",
    });

    const ctx = getProjectContext(dir);
    expect(ctx).toBe("A Python data pipeline project");
  });

  it("getProjectContext returns undefined when no context", () => {
    const dir = createTestDir({ setup: "echo hi" });
    const ctx = getProjectContext(dir);
    expect(ctx).toBeUndefined();
  });

  it("caches config and returns same result on repeat calls", () => {
    const dir = createTestDir({ run: "npm start" });

    const config1 = loadProjectConfig(dir);
    const config2 = loadProjectConfig(dir);
    expect(config1).toEqual(config2);
  });
});
