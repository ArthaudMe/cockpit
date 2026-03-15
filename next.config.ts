import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  eslint: {
    // eslint-config-next not installed in this workspace; lint separately if needed
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
