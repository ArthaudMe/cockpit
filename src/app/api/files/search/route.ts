import { NextRequest, NextResponse } from "next/server";
import fg from "fast-glob";

// QuickOpen fires a request per (debounced) keystroke — walking the whole
// tree each time is wasteful. Cache the file list per cwd for a few seconds;
// scoring against the query stays per-request.
const listCache = new Map<string, { entries: string[]; time: number }>();
const LIST_CACHE_TTL = 15_000;

async function listFiles(cwd: string): Promise<string[]> {
  const hit = listCache.get(cwd);
  if (hit && Date.now() - hit.time < LIST_CACHE_TTL) return hit.entries;

  const entries = await fg("**/*", {
    cwd,
    ignore: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/.cache/**",
      "**/coverage/**",
    ],
    dot: false,
    onlyFiles: true,
    absolute: true,
  });

  listCache.set(cwd, { entries, time: Date.now() });
  return entries;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const cwd = req.nextUrl.searchParams.get("cwd") || process.cwd();

  try {
    const entries = await listFiles(cwd);

    let results = entries;

    if (query) {
      const lower = query.toLowerCase();
      const terms = lower.split(/\s+/);

      // Score each file by fuzzy match
      const scored = entries
        .map((file) => {
          const rel = file.slice(cwd.length + 1).toLowerCase();
          let score = 0;

          for (const term of terms) {
            if (rel.includes(term)) {
              score += 10;
              // Bonus for filename match vs directory match
              const basename = rel.split("/").pop() || "";
              if (basename.includes(term)) score += 5;
              // Exact filename match
              if (basename === term || basename.startsWith(term + "."))
                score += 10;
            } else {
              // Fuzzy: check if all chars appear in order
              let fi = 0;
              for (const ch of rel) {
                if (fi < term.length && ch === term[fi]) fi++;
              }
              if (fi === term.length) {
                score += 1;
              } else {
                return null; // No match at all
              }
            }
          }

          return { file, score };
        })
        .filter(Boolean) as { file: string; score: number }[];

      scored.sort((a, b) => b.score - a.score);
      results = scored.slice(0, 20).map((s) => s.file);
    } else {
      results = entries.slice(0, 20);
    }

    return NextResponse.json({ files: results });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
