import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // `next build` emits a self-contained server at `.next/standalone/server.js`
  // plus a trimmed `node_modules/`. The Electron build picks this up so the
  // packaged `.app` can run without a full repo install. No effect on `next
  // dev` / `next start` in plain web mode.
  output: "standalone",
};

export default nextConfig;
