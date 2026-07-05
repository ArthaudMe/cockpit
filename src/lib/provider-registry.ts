/**
 * Declarative Provider Registry
 *
 * Single source of truth for all CLI agent providers.
 * Adding a new provider should be one registry entry plus focused tests.
 */

export interface ProviderModel {
  id: string;
  label: string;
}

export type ProviderInstallCapability =
  | { kind: "command"; hint: string }
  | { kind: "url"; hint: string };

export type ProviderModelCapability = {
  kind: "selectable";
  options: ProviderModel[];
  defaultModel: string;
};

export type ProviderPromptCapability = {
  delivery: "stdin";
  systemPrompt:
    | { kind: "append-system-prompt-flag" }
    | { kind: "system-prompt-flag" }
    | { kind: "ollama-system-flag" }
    | { kind: "codex-developer-instructions-config" };
  images: { kind: "argv-image-flags"; flag: string } | { kind: "none" };
};

export type ProviderLifecycleCapability = {
  prewarm: boolean;
  hooks: { kind: "claude-workspace" } | { kind: "none" };
};

export type ProviderPermissionCapability = {
  autoApprove: { kind: "argv"; args: string[] } | { kind: "none" };
};

export interface ProviderCapabilities {
  install: ProviderInstallCapability;
  models: ProviderModelCapability;
  prompt: ProviderPromptCapability;
  lifecycle: ProviderLifecycleCapability;
  permissions: ProviderPermissionCapability;
  output: { kind: "plain-text" } | { kind: "codex-jsonl" };
}

type ProviderSpec = {
  id: string;
  label: string;
  icon: string;
  binary: string;
  /** Args to detect version (e.g., ["--version"]) */
  versionArgs: string[];
  capabilities: ProviderCapabilities;
  auth?: {
    loginCommand: string;
    loginRoute?: string;
    unauthenticatedMatchers: string[];
    loginHint?: string;
  };
  /** Build CLI args for a one-shot prompt */
  buildArgs: (model: string, systemPrompt: string, opts?: { images?: string[] }) => string[];
};

export type ProviderDef = ProviderSpec & {
  /** Compatibility aliases derived from capabilities. */
  installHint: string;
  models: ProviderModel[];
  defaultModel: string;
  supportsPrewarm: boolean;
  autoApproveArgs?: string[];
  supportsHooks: boolean;
};

export type PublicProviderDef = {
  id: string;
  label: string;
  icon: string;
  models: ProviderModel[];
  defaultModel: string;
  capabilities: ProviderCapabilities;
};

function defineProvider(spec: ProviderSpec): ProviderDef {
  const autoApprove = spec.capabilities.permissions.autoApprove;
  return {
    ...spec,
    installHint: spec.capabilities.install.hint,
    models: spec.capabilities.models.options,
    defaultModel: spec.capabilities.models.defaultModel,
    supportsPrewarm: spec.capabilities.lifecycle.prewarm,
    autoApproveArgs: autoApprove.kind === "argv" ? autoApprove.args : undefined,
    supportsHooks: spec.capabilities.lifecycle.hooks.kind !== "none",
  };
}

export const PROVIDERS: Record<string, ProviderDef> = {
  claude: defineProvider({
    id: "claude",
    label: "Claude",
    icon: "◇",
    binary: "claude",
    versionArgs: ["--version"],
    capabilities: {
      install: {
        kind: "command",
        hint: "npm install -g @anthropic-ai/claude-code",
      },
      models: {
        kind: "selectable",
        options: [
          { id: "claude-opus-4-8", label: "Opus 4.8 (smart)" },
          { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (fast)" },
          { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (instant)" },
        ],
        defaultModel: "claude-sonnet-4-6",
      },
      prompt: {
        delivery: "stdin",
        systemPrompt: { kind: "append-system-prompt-flag" },
        images: { kind: "argv-image-flags", flag: "--image" },
      },
      lifecycle: {
        prewarm: true,
        hooks: { kind: "claude-workspace" },
      },
      permissions: {
        autoApprove: { kind: "argv", args: ["--allowedTools", "mcp__*"] },
      },
      output: { kind: "plain-text" },
    },
    auth: {
      loginCommand: "claude auth login",
      loginRoute: "/api/authenticate-claude",
      unauthenticatedMatchers: [
        "not logged in",
        "please run /login",
        "authentication required",
        "not authenticated",
        "claude auth login",
      ],
      loginHint: "If the browser sign-in flow does not open, run the command manually.",
    },
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
  }),

  codex: defineProvider({
    id: "codex",
    label: "Codex",
    icon: "◆",
    binary: "codex",
    versionArgs: ["--version"],
    capabilities: {
      install: {
        kind: "command",
        hint: "npm install -g @openai/codex",
      },
      models: {
        kind: "selectable",
        options: [
          { id: "gpt-5.5", label: "GPT-5.5 (smart)" },
          { id: "o4-mini", label: "o4-mini (fast)" },
          { id: "o3", label: "o3 (reasoning)" },
        ],
        defaultModel: "gpt-5.5",
      },
      prompt: {
        delivery: "stdin",
        systemPrompt: { kind: "codex-developer-instructions-config" },
        images: { kind: "none" },
      },
      lifecycle: {
        prewarm: true,
        hooks: { kind: "none" },
      },
      permissions: {
        autoApprove: { kind: "none" },
      },
      output: { kind: "codex-jsonl" },
    },
    auth: {
      loginCommand: "codex login",
      unauthenticatedMatchers: [
        "not logged in",
        "login required",
        "not authenticated",
        "authentication required",
        "codex login",
        "run /login",
        "run `/login`",
        "sign in",
      ],
      loginHint: "You can also start Codex interactively and run /login.",
    },
    buildArgs: (model, systemPrompt) => [
      "exec",
      "--json",
      "--model", model,
      "--skip-git-repo-check",
      "-c", `developer_instructions=${JSON.stringify(systemPrompt)}`,
      "-",
    ],
  }),

  ollama: defineProvider({
    id: "ollama",
    label: "Ollama",
    icon: "○",
    binary: "ollama",
    versionArgs: ["--version"],
    capabilities: {
      install: {
        kind: "url",
        hint: "https://ollama.com/download",
      },
      models: {
        kind: "selectable",
        options: [
          { id: "llama3.3", label: "Llama 3.3" },
          { id: "qwen3", label: "Qwen 3" },
          { id: "deepseek-r1", label: "DeepSeek R1" },
          { id: "gemma3", label: "Gemma 3" },
        ],
        defaultModel: "llama3.3",
      },
      prompt: {
        delivery: "stdin",
        systemPrompt: { kind: "ollama-system-flag" },
        images: { kind: "none" },
      },
      lifecycle: {
        prewarm: false,
        hooks: { kind: "none" },
      },
      permissions: {
        autoApprove: { kind: "none" },
      },
      output: { kind: "plain-text" },
    },
    buildArgs: (model, systemPrompt) => ["run", model, "--system", systemPrompt],
  }),
};

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS[id];
}

export function isProviderId(id: unknown): id is string {
  return typeof id === "string" && Boolean(PROVIDERS[id]);
}

export function isProviderModel(providerId: string, modelId: string): boolean {
  return Boolean(PROVIDERS[providerId]?.capabilities.models.options.some((model) => model.id === modelId));
}

export function providerSupportsPrewarm(provider: ProviderDef): boolean {
  return provider.capabilities.lifecycle.prewarm;
}

export function providerUsesClaudeHooks(provider: ProviderDef): boolean {
  return provider.capabilities.lifecycle.hooks.kind === "claude-workspace";
}

export function providerSupportsImages(provider: ProviderDef): boolean {
  return provider.capabilities.prompt.images.kind !== "none";
}

export function listProviders(): ProviderDef[] {
  return Object.values(PROVIDERS);
}

export function getProviderDefs(): PublicProviderDef[] {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    icon: p.icon,
    models: p.capabilities.models.options,
    defaultModel: p.capabilities.models.defaultModel,
    capabilities: p.capabilities,
  }));
}
