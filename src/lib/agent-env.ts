/**
 * Environment Variable Allowlist
 *
 * Curated list of env vars that are safe and useful to pass to spawned agents.
 * Everything else is stripped. This prevents leaking unrelated secrets while
 * ensuring agents get the API keys and config they need.
 */

const ALLOWED_ENV_VARS = [
  // ─── API Keys ───────────────────────────────────────────────────
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
  "TOGETHER_API_KEY",
  "FIREWORKS_API_KEY",
  "DEEPSEEK_API_KEY",
  "XAI_API_KEY",
  "PERPLEXITY_API_KEY",
  "REPLICATE_API_TOKEN",
  "HUGGINGFACE_API_KEY",
  "HF_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_API_KEY",

  // ─── Tool API Keys ─────────────────────────────────────────────
  "GITHUB_TOKEN",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "GH_TOKEN",
  "GITLAB_TOKEN",
  "LINEAR_API_KEY",
  "SLACK_TOKEN",
  "NOTION_API_KEY",
  "JIRA_API_TOKEN",

  // ─── Runtime / Shell ────────────────────────────────────────────
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "PATH",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",

  // ─── Node / Dev ─────────────────────────────────────────────────
  "NODE_ENV",
  "NODE_PATH",
  "NPM_CONFIG_PREFIX",
  "NVM_DIR",
  "PNPM_HOME",
  "BUN_INSTALL",
  "DENO_DIR",
  "CARGO_HOME",
  "GOPATH",
  "GOROOT",
  "PYENV_ROOT",
  "CONDA_PREFIX",
  "VIRTUAL_ENV",

  // ─── Cockpit-specific ──────────────────────────────────────────
  "COCKPIT_HOOK_PORT",
  "COCKPIT_HOOK_TOKEN",
  "COCKPIT_AGENT_ID",
];

const ALLOWED_SET = new Set(ALLOWED_ENV_VARS);

/**
 * Build a clean environment for spawned agent processes.
 * Only passes through allowed env vars + any COCKPIT_* prefixed vars.
 */
export function buildAgentEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (ALLOWED_SET.has(key) || key.startsWith("COCKPIT_")) {
      env[key] = value;
    }
  }

  // Never pass CLAUDECODE — prevents nested session detection
  delete env.CLAUDECODE;

  // Merge any extra vars (e.g., hook port, agent ID)
  if (extra) {
    Object.assign(env, extra);
  }

  return env as NodeJS.ProcessEnv;
}
