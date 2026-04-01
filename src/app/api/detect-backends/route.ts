import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { listProviders } from "@/lib/provider-registry";
import { buildAgentEnv } from "@/lib/agent-env";

const execFileAsync = promisify(execFile);

type BackendStatus = {
  id: string;
  label: string;
  installed: boolean;
  version?: string;
  installHint?: string;
};

async function detectProvider(provider: { id: string; label: string; binary: string; versionArgs: string[]; installHint: string }): Promise<BackendStatus> {
  try {
    const { stdout } = await execFileAsync(provider.binary, provider.versionArgs, {
      timeout: 5000,
      env: buildAgentEnv(),
    });
    return { id: provider.id, label: provider.label, installed: true, version: stdout.trim() };
  } catch {
    return { id: provider.id, label: provider.label, installed: false, installHint: provider.installHint };
  }
}

export async function GET() {
  const providers = listProviders();
  const results = await Promise.all(providers.map(detectProvider));

  return NextResponse.json({
    backends: results,
    anyAvailable: results.some((r) => r.installed),
  });
}
