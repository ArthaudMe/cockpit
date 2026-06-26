/**
 * Post-build step for Electron packaging.
 *
 * `next build` with `output: "standalone"` emits a self-contained server at
 * .next/standalone/server.js, but static assets and public files must be
 * placed next to it manually (per Next.js docs). Run after `next build`,
 * before `electron-builder`.
 */
const {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const standaloneNodeModules = path.join(standalone, "node_modules");

function materializeSymlinks(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      const targetPath = realpathSync(entryPath);
      const linkText = readlinkSync(entryPath);
      rmSync(entryPath, { recursive: true, force: true });
      cpSync(targetPath, entryPath, { recursive: true });
      count += 1;
      console.log(`[prepare-standalone] materialized symlink ${path.relative(standalone, entryPath)} -> ${linkText}`);
    } else if (stat.isDirectory()) {
      count += materializeSymlinks(entryPath);
    }
  }
  return count;
}

function materializePnpmAliases(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, ".pnpm");
  if (!existsSync(pnpmDir)) return 0;
  let count = 0;
  for (const packageDir of readdirSync(pnpmDir)) {
    const nestedNodeModules = path.join(pnpmDir, packageDir, "node_modules");
    if (!existsSync(nestedNodeModules)) continue;

    for (const entry of readdirSync(nestedNodeModules)) {
      if (entry.startsWith(".")) continue;

      if (entry.startsWith("@")) {
        const scopeDir = path.join(nestedNodeModules, entry);
        if (!lstatSync(scopeDir).isDirectory()) continue;
        for (const scopedEntry of readdirSync(scopeDir)) {
          const source = path.join(scopeDir, scopedEntry);
          const target = path.join(nodeModulesDir, entry, scopedEntry);
          if (existsSync(target)) continue;
          mkdirSync(path.dirname(target), { recursive: true });
          cpSync(source, target, { recursive: true });
          count += 1;
        }
        continue;
      }

      const source = path.join(nestedNodeModules, entry);
      const target = path.join(nodeModulesDir, entry);
      if (existsSync(target)) continue;
      cpSync(source, target, { recursive: true });
      count += 1;
    }
  }
  return count;
}

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("[prepare-standalone] .next/standalone/server.js not found — did `next build` run with output: \"standalone\"?");
  process.exit(1);
}

const serverJs = path.join(standalone, "server.js");
const serverSource = readFileSync(serverJs, "utf-8");
const chdirLine = "process.chdir(__dirname)";
if (serverSource.includes(chdirLine) && !serverSource.includes(".asar")) {
  writeFileSync(
    serverJs,
    serverSource.replace(
      chdirLine,
      "if (!__dirname.includes('.asar')) {\n  process.chdir(__dirname)\n}"
    )
  );
  console.log("[prepare-standalone] patched server.js for ASAR runtime");
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

const symlinkCount = materializeSymlinks(standaloneNodeModules);
if (symlinkCount > 0) {
  console.log(`[prepare-standalone] materialized ${symlinkCount} standalone node_modules symlink(s)`);
}
const aliasCount = materializePnpmAliases(standaloneNodeModules);
if (aliasCount > 0) {
  console.log(`[prepare-standalone] materialized ${aliasCount} pnpm package alias(es)`);
}

console.log("[prepare-standalone] done");
