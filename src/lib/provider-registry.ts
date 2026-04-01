/**
 * Declarative Provider Registry
 *
 * Single source of truth for all CLI agent providers.
 * Adding a new provider = adding one entry to PROVIDERS.
 */

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ProviderDef {
  id: string;
  label: string;
  icon: string;
  binary: string;
  /** Args to detect version (e.g., ["--version"]) */
  versionArgs: string[];
  /** How to install (shown to user) */
  installHint: string;
  models: ProviderModel[];
  defaultModel: string;
  /** Build CLI args for a one-shot prompt */
  buildArgs: (model: string, systemPrompt: string, opts?: { images?: string[] }) => string[];
  /** Whether the provider supports pre-warming (spawn early, write to stdin later) */
  supportsPrewarm: boolean;
  /** Auto-approve flags (skip confirmation prompts) */
  autoApproveArgs?: string[];
  /** Whether hooks can be injected for structured events */
  supportsHooks: boolean;
}

export const PROVIDERS: Record<string, ProviderDef> = {
  claude: {
    id: "claude",
    label: "Claude",
    icon: "◇",
    binary: "claude",
    versionArgs: ["--version"],
    installHint: "npm install -g @anthropic-ai/claude-code",
    models: [
      { id: "claude-sonnet-4-6", label: "Sonnet (fast)" },
      { id: "claude-opus-4-6", label: "Opus (smart)" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku (instant)" },
    ],
    defaultModel: "claude-sonnet-4-6",
    buildArgs: (model, systemPrompt, opts) => {
      const args = [
        "-p",
        "--output-format", "text",
        "--model", model,
        "--append-system-prompt", systemPrompt,
      ];
      if (opts?.images) {
        for (const img of opts.images) {
          args.push("--image", img);
        }
      }
      return args;
    },
    supportsPrewarm: true,
    autoApproveArgs: ["--allowedTools", "mcp__*"],
    supportsHooks: true,
  },

  codex: {
    id: "codex",
    label: "Codex",
    icon: "◆",
    binary: "codex",
    versionArgs: ["--version"],
    installHint: "npm install -g @openai/codex",
    models: [
      { id: "o4-mini", label: "o4-mini (fast)" },
      { id: "o3", label: "o3 (smart)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
    ],
    defaultModel: "o4-mini",
    buildArgs: (model, systemPrompt) => [
      "-q",
      "--model", model,
      "--system-prompt", systemPrompt,
    ],
    supportsPrewarm: true,
    supportsHooks: false,
  },

  ollama: {
    id: "ollama",
    label: "Ollama",
    icon: "○",
    binary: "ollama",
    versionArgs: ["--version"],
    installHint: "https://ollama.com/download",
    models: [
      { id: "llama3.3", label: "Llama 3.3" },
      { id: "qwen3", label: "Qwen 3" },
      { id: "deepseek-r1", label: "DeepSeek R1" },
      { id: "gemma3", label: "Gemma 3" },
    ],
    defaultModel: "llama3.3",
    buildArgs: (model) => ["run", model],
    supportsPrewarm: false,
    supportsHooks: false,
  },

  gemini: {
    id: "gemini",
    label: "Gemini",
    icon: "◈",
    binary: "gemini",
    versionArgs: ["--version"],
    installHint: "npm install -g @anthropic-ai/gemini-cli",
    models: [
      { id: "gemini-2.5-pro", label: "2.5 Pro" },
      { id: "gemini-2.5-flash", label: "2.5 Flash" },
    ],
    defaultModel: "gemini-2.5-pro",
    buildArgs: (model, systemPrompt) => [
      "--model", model,
      "--system-instruction", systemPrompt,
    ],
    supportsPrewarm: false,
    supportsHooks: false,
  },

  aider: {
    id: "aider",
    label: "Aider",
    icon: "▸",
    binary: "aider",
    versionArgs: ["--version"],
    installHint: "pip install aider-chat",
    models: [
      { id: "sonnet", label: "Sonnet" },
      { id: "opus", label: "Opus" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    defaultModel: "sonnet",
    buildArgs: (model, _systemPrompt) => [
      "--model", model,
      "--no-auto-commits",
      "--yes",
      "--message",
    ],
    supportsPrewarm: false,
    supportsHooks: false,
  },
};

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS[id];
}

export function listProviders(): ProviderDef[] {
  return Object.values(PROVIDERS);
}

export function getProviderDefs() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    icon: p.icon,
    models: p.models,
    defaultModel: p.defaultModel,
  }));
}
