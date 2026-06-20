/**
 * Post-build step for Electron packaging.
 *
 * `next build` with `output: "standalone"` emits a self-contained server at
 * .next/standalone/server.js, but static assets and public files must be
 * placed next to it manually (per Next.js docs). Run after `next build`,
 * before `electron-builder`.
 */
const { cpSync, rmSync, existsSync } = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("[prepare-standalone] .next/standalone/server.js not found — did `next build` run with output: \"standalone\"?");
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
rmSync(staticDest, { recursive: true, force: true });
cpSync(staticSrc, staticDest, { recursive: true });
console.log("[prepare-standalone] copied .next/static");

const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");
if (existsSync(publicSrc)) {
  rmSync(publicDest, { recursive: true, force: true });
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log("[prepare-standalone] copied public/");
}

console.log("[prepare-standalone] done");
