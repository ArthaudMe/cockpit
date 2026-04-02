import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { extname } from "path";

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".css": "css",
  ".html": "html",
  ".md": "markdown",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sh": "shell",
  ".bash": "shell",
  ".sql": "sql",
  ".graphql": "graphql",
  ".xml": "xml",
  ".svg": "xml",
  ".env": "plaintext",
  ".txt": "plaintext",
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] || "plaintext";
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const content = await readFile(path, "utf-8");
    return NextResponse.json({
      content,
      language: detectLanguage(path),
      path,
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Failed to read file" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const { path, content } = await req.json();
  if (!path || typeof content !== "string") {
    return NextResponse.json(
      { error: "path and content are required" },
      { status: 400 }
    );
  }

  try {
    await writeFile(path, content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to write file" },
      { status: 500 }
    );
  }
}
