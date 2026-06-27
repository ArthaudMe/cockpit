import { NextResponse } from "next/server";
import { listProviders } from "@/lib/provider-registry";
import { detectProvider } from "@/lib/provider-runtime";

export async function GET() {
  const results = await Promise.all(
    listProviders().map(async (provider) => ({
      provider,
      result: await detectProvider(provider),
    }))
  );
  const connected = results.some(({ result }) => result.ok);
  const primary = results.find(({ result }) => result.ok);

  return NextResponse.json({
    connected,
    provider: primary?.provider.id,
    providerLabel: primary?.provider.label,
    version: primary?.result.version,
    cwd: process.cwd(),
    backends: Object.fromEntries(
      results.map(({ provider, result }) => [
        provider.id,
        {
          connected: result.ok,
          version: result.version,
          binaryPath: result.binaryPath,
          error: result.error,
        },
      ])
    ),
  });
}
