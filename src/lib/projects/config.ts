/**
 * Per-project Config (.cockpit.json)
 *
 * Allows projects to define lifecycle scripts, environment overrides,
 * and shell setup. Loaded from the project's root directory.
 *
 * Example .cockpit.json:
 * {
 *   "setup": "pnpm install && make dev-up",
 *   "teardown": "make dev-down",
 *   "run": "pnpm dev",
 *   "env": {
 *     "DATABASE_URL": "postgres://localhost:5432/mydb"
 *   },
 *   "preserve": [".env", ".env.local", "node_modules"],
 *   "shell": "zsh"
 * }
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface ProjectConfig {
  /** Command to run when project is opened/activated */
  setup?: string;
  /** Command to run when project is closed/deactivated */
  teardown?: string;
  /** Command to start the dev server */
  run?: string;
  /** Command to stop the dev server */
  stop?: string;
  /** Extra environment variables for this project */
  env?: Record<string, string>;
  /** Files/dirs to preserve (e.g., when resetting worktrees) */
  preserve?: string[];
  /** Shell to use for lifecycle scripts */
  shell?: string;
  /** Custom system prompt additions for agents working on this project */
  context?: string;
}

const configCache = new Map<string, { config: ProjectConfig | null; mtime: number }>();
const CACHE_TTL = 10_000; // 10 seconds

/**
 * Load .cockpit.json from a project directory.
 * Returns null if no config file exists or it's invalid.
 * Results are cached for 10 seconds.
 */
export function loadProjectConfig(projectDir: string): ProjectConfig | null {
  const configPath = join(projectDir, ".cockpit.json");

  // Check cache
  const cached = configCache.get(configPath);
  if (cached && Date.now() - cached.mtime < CACHE_TTL) {
    return cached.config;
  }

  try {
    if (!existsSync(configPath)) {
      configCache.set(configPath, { config: null, mtime: Date.now() });
      return null;
    }

    const raw = readFileSync(configPath, "utf-8");
    const config: ProjectConfig = JSON.parse(raw);

    configCache.set(configPath, { config, mtime: Date.now() });
    return config;
  } catch (err) {
    console.error("[project-config] failed to load %s: %s", configPath, err);
    configCache.set(configPath, { config: null, mtime: Date.now() });
    return null;
  }
}

/**
 * Get merged environment variables for a project (base env + project overrides).
 */
export function getProjectEnv(projectDir: string): Record<string, string> | undefined {
  const config = loadProjectConfig(projectDir);
  return config?.env;
}

/**
 * Get the context string to append to agent system prompts for this project.
 */
export function getProjectContext(projectDir: string): string | undefined {
  const config = loadProjectConfig(projectDir);
  return config?.context;
}
