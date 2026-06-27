import { NextResponse } from "next/server";
import { getBackendDefs } from "@/lib/agent-manager";
import { listOllamaModels } from "@/lib/provider-runtime";

export async function GET() {
  const defs = getBackendDefs();
  const ollamaModels = await listOllamaModels();

  if (ollamaModels.length === 0) {
    return NextResponse.json(defs);
  }

  return NextResponse.json(
    defs.map((def) =>
      def.id === "ollama"
        ? {
            ...def,
            models: ollamaModels,
            defaultModel: ollamaModels[0].id,
          }
        : def
    )
  );
}
