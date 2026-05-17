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
  // Tracer can't statically resolve `spawn(WX_BIN, …)` in lib/wx.ts and
  // ends up sweeping the entire project, including the .app build output
  // under release/. That makes the standalone bundle balloon (and worse,
  // recursive — release/.../app/.next/standalone/release/...). Exclude
  // everything we know isn't needed at runtime.
  outputFileTracingExcludes: {
    "*": [
      "release/**",
      "build/**",
      "electron/**",
      "scripts/**",
      "tests/**",
      "*.md",
      ".github/**",
      "task_plan.md",
      "findings.md",
      "progress.md",
      "bun.lock",
      "package-lock.json",
    ],
  },
};

export default nextConfig;
