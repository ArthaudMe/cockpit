import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { delimiter, isAbsolute, join } from "path";
import { buildAgentEnv } from "./agent-env";
import type { ProviderDef, ProviderModel } from "./provider-registry";

const execFileAsync = promisify(execFile);

export type ProviderDetection = {
  ok: boolean;
  version?: string;
  binaryPath?: string;
  error?: string;
};

export type SpawnTarget = {
  command: string;
  env: NodeJS.ProcessEnv;
};

const binaryCache = new Map<string, string | null>();

function isExecutableFile(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

export function resolveBinary(binary: string, env = buildAgentEnv()): string | null {
  if (isAbsolute(binary)) return isExecutableFile(binary) ? binary : null;

  const cacheKey = `${binary}:${env.PATH || ""}`;
  if (binaryCache.has(cacheKey)) return binaryCache.get(cacheKey) || null;

  for (const dir of (env.PATH || "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    if (isExecutableFile(candidate)) {
      binaryCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  binaryCache.set(cacheKey, null);
  return null;
}

export function getSpawnTarget(binary: string, extraEnv?: Record<string, string>): SpawnTarget {
  const env = buildAgentEnv(extraEnv);
  return {
    command: resolveBinary(binary, env) || binary,
    env,
  };
}

export async function detectProvider(provider: ProviderDef): Promise<ProviderDetection> {
  const env = buildAgentEnv();
  const binaryPath = resolveBinary(provider.binary, env);
  if (!binaryPath) {
    return { ok: false, error: "Not found on PATH" };
  }

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, provider.versionArgs, {
      timeout: 5000,
      env,
    });
    return {
      ok: true,
      version: (stdout || stderr).trim(),
      binaryPath,
    };
  } catch (err) {
    return {
      ok: false,
      binaryPath,
      error: err instanceof Error ? err.message : "Version check failed",
    };
  }
}

export async function listOllamaModels(): Promise<ProviderModel[]> {
  const target = getSpawnTarget("ollama");
  if (!resolveBinary("ollama", target.env)) return [];

  try {
    const { stdout } = await execFileAsync(target.command, ["list"], {
      timeout: 5000,
      env: target.env,
    });

    return stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean)
      .map((name) => ({ id: name, label: name }));
  } catch {
    return [];
  }
}
