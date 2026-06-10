import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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
