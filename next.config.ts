import type { NextConfig } from "next";
import path from "path";

if (!process.env.OAUTH_PROXY_SECRET) {
  console.warn(
    "[next.config] OAUTH_PROXY_SECRET is not set — OAuth connects via the " +
      "proxy will fail in this build. Add it to .env.local (value must match " +
      "PROXY_SECRET on the Vercel proxy)."
  );
}

const nextConfig: NextConfig = {
  // Inlined at build time so the packaged app works without runtime env.
  // The value never lives in the repo — only in .env.local / CI env.
  env: {
    OAUTH_PROXY_SECRET: process.env.OAUTH_PROXY_SECRET ?? "",
  },
  // Self-contained server bundle for Electron packaging: ships only the
  // traced runtime files instead of the entire node_modules tree.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  eslint: {
    // eslint-config-next not installed in this workspace; lint separately if needed
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
