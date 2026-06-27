import { NextResponse } from "next/server";
import { listProviders, type ProviderDef } from "@/lib/provider-registry";
import { detectProvider as detectProviderRuntime } from "@/lib/provider-runtime";

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  installHint?: string;
  binaryPath?: string;
  error?: string;
};

async function detectBackend(provider: ProviderDef): Promise<BackendStatus> {
  const result = await detectProviderRuntime(provider);
  return {
    id: provider.id,
    label: provider.label,
    installed: result.ok,
    version: result.version,
    binaryPath: result.binaryPath,
    error: result.error,
    installHint: result.ok ? undefined : provider.capabilities.install.hint,
  };
}

export async function GET() {
  const providers = listProviders();
  const results = await Promise.all(providers.map(detectBackend));

  return NextResponse.json({
    backends: results,
    anyAvailable: results.some((r) => r.installed),
  });
}
