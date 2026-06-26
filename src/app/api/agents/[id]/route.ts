import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  deleteAgent,
  updateAgent,
  ensureAgentRuntimeStarted,
  type AgentBackend,
  type AgentRole,
} from "@/lib/agent-manager";
import { PROVIDERS } from "@/lib/provider-registry";

const VALID_ROLES = new Set<AgentRole>(["general", "research", "writer", "ops"]);
const ALLOWED_PATCH_KEYS = new Set(["name", "role", "backend", "model"]);

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(agent);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Request body must be an object");
  }

  for (const key of Object.keys(body)) {
    if (!ALLOWED_PATCH_KEYS.has(key)) {
      return badRequest(`Unknown field: ${key}`);
    }
  }

  const updates: {
    backend?: AgentBackend;
    model?: string;
    name?: string;
    role?: AgentRole;
  } = {};

  if ("name" in body) {
    if (typeof body.name !== "string") {
      return badRequest("name must be a string");
    }
    const name = body.name.trim();
    if (!name) {
      return badRequest("name cannot be empty");
    }
    if (name.length > 80) {
      return badRequest("name must be 80 characters or fewer");
    }
    updates.name = name;
  }

  if ("role" in body) {
    if (typeof body.role !== "string" || !VALID_ROLES.has(body.role as AgentRole)) {
      return badRequest("role is invalid");
    }
    updates.role = body.role as AgentRole;
  }

  if ("backend" in body) {
    if (typeof body.backend !== "string" || !PROVIDERS[body.backend]) {
      return badRequest("backend is invalid");
    }
    updates.backend = body.backend;
  }

  if ("model" in body) {
    if (typeof body.model !== "string" || !body.model.trim()) {
      return badRequest("model must be a non-empty string");
    }
    const backend = updates.backend ?? agent.backend;
    const provider = PROVIDERS[backend];
    if (!provider) {
      return badRequest("backend is invalid");
    }
    if (!provider.models.some((model) => model.id === body.model)) {
      return badRequest("model is invalid for backend");
    }
    updates.model = body.model;
  }

  const updated = updateAgent(id, updates);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureAgentRuntimeStarted();
  const { id } = await params;
  const deleted = deleteAgent(id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
