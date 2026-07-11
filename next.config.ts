import type { NextConfig } from "next";
import path from "path";

if (!process.env.OAUTH_PROXY_URL || !process.env.OAUTH_PROXY_SECRET) {
  console.warn(
    "[next.config] OAUTH_PROXY_URL or OAUTH_PROXY_SECRET is not set — OAuth " +
      "proxy connects will be disabled in this build. Add both to .env.local " +
      "(secret must match PROXY_SECRET on the deployed proxy)."
  );
}

if (
  !process.env.COMPOSIO_API_KEY ||
  !process.env.COMPOSIO_GCAL_AUTH_CONFIG ||
  !process.env.COMPOSIO_GMAIL_AUTH_CONFIG
) {
  console.warn(
    "[next.config] Composio Google credentials are not set — Google Calendar/Gmail " +
      "connects will be disabled in this build. Add COMPOSIO_API_KEY, " +
      "COMPOSIO_GCAL_AUTH_CONFIG, and COMPOSIO_GMAIL_AUTH_CONFIG."
  );
}

const nextConfig: NextConfig = {
  // Inlined at build time so the packaged app works without runtime env.
  // Values never live in the repo — only in .env.local / CI env.
  env: {
    OAUTH_PROXY_URL: process.env.OAUTH_PROXY_URL ?? "",
    OAUTH_PROXY_SECRET: process.env.OAUTH_PROXY_SECRET ?? "",
    COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY ?? "",
    COMPOSIO_GCAL_AUTH_CONFIG: process.env.COMPOSIO_GCAL_AUTH_CONFIG ?? "",
    COMPOSIO_GMAIL_AUTH_CONFIG: process.env.COMPOSIO_GMAIL_AUTH_CONFIG ?? "",
  },
  // Self-contained server bundle for Electron packaging: ships only the
  // traced runtime files instead of the entire node_modules tree.
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  eslint: {
    // Lint runs as a separate `pnpm lint` step; don't block production builds.
    ignoreDuringBuilds: true,
  },
  // Defense-in-depth CSP for the Electron renderer loading the local Next
  // server. 'unsafe-inline' on scripts is required by Next's dev/inline
  // runtime; the value here is locking down remote resource loads and
  // exfiltration (connect-src 'self', object-src 'none', frame-ancestors).
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
