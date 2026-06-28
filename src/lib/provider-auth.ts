import type { ProviderDef } from "./provider-registry";

const GENERIC_AUTH_MATCHERS = [
  "not logged in",
  "not authenticated",
  "authentication required",
  "login required",
  "unauthorized",
];

export function isProviderAuthError(provider: ProviderDef, output: string | undefined): boolean {
  if (!output) return false;
  const normalized = output.toLowerCase();
  const matchers = [
    ...GENERIC_AUTH_MATCHERS,
    ...(provider.auth?.unauthenticatedMatchers || []),
  ];

  return matchers.some((matcher) => normalized.includes(matcher.toLowerCase()));
}

export function providerLoginNeededMessage(provider: ProviderDef): string {
  const command = provider.auth?.loginCommand;
  const hint = provider.auth?.loginHint;
  const prefix = provider.auth?.loginRoute ? "Use the Cockpit sign-in flow, or " : "";
  const commandText = command
    ? `${prefix}open Terminal and run \`${command}\`, then try your message again.`
    : "Open the provider's login flow, then try your message again.";

  return [
    `${provider.label} CLI is installed but not logged in.`,
    commandText,
    hint,
  ].filter(Boolean).join(" ");
}
