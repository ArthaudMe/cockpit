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
      { id: "claude-opus-4-8", label: "Opus 4.8 (smart)" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (fast)" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (instant)" },
    ],
    defaultModel: "claude-sonnet-4-6",
    buildArgs: (model, systemPrompt, opts) => {
      const args = [
        "-p",
        "--output-format", "text",
        "--model", model,
        "--append-system-prompt", systemPrompt,
        "--strict-mcp-config",
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
      { id: "gpt-5.5", label: "GPT-5.5 (smart)" },
      { id: "o4-mini", label: "o4-mini (fast)" },
      { id: "o3", label: "o3 (reasoning)" },
    ],
    defaultModel: "gpt-5.5",
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
    buildArgs: (model, systemPrompt) => ["run", model, "--system", systemPrompt],
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
