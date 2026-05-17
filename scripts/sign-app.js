/**
 * Ad-hoc sign release/mac-universal/WeChat Explorer.app using
 * @electron/osx-sign — the same library electron-builder calls
 * internally, but invoked directly here because electron-builder's
 * signing wrapper can't reliably handle @electron/universal's
 * lipo-merged binary (it leaves resource-fork detritus from the merge,
 * and codesign --deep won't re-sign already-signed nested frameworks
 * with mismatched team IDs).
 *
 * Run after `electron-builder --mac` has produced the .app and after
 * xattr / dot-file cleanup has stripped the resource-fork leftovers.
 */

const path = require("node:path");
const { existsSync } = require("node:fs");
const { signAsync } = require("@electron/osx-sign");

// The build script signs in a temp dir to avoid Sequoia's provenance
// auto-tagging in user paths; let it pass APP via env when that flow is
// in use, otherwise default to the release output.
const repoRoot = path.join(__dirname, "..");
const appPath =
  process.env.APP ||
  path.join(repoRoot, "release", "mac-universal", "WeChat Explorer.app");

if (!existsSync(appPath)) {
  console.error(`✗ ${appPath} not found — has electron-builder run?`);
  process.exit(1);
}

(async () => {
  try {
    await signAsync({
      app: appPath,
      // Ad-hoc signature — satisfies macOS Sequoia's "must be signed"
      // requirement without needing a paid Apple Developer cert. Users
      // still see the unverified-developer prompt on first launch.
      identity: "-",
      identityValidation: false,
      gatekeeperAssess: false,
      preEmbedProvisioningProfile: false,
      preAutoEntitlements: false,
      strictVerify: false,
      // Per-file override: osx-sign's top-level `hardenedRuntime: false`
      // is only used as a default when computing optionsForFile. Without
      // explicit per-file options, osx-sign passes --options runtime to
      // codesign anyway, which makes macOS Sequoia enforce strict team-
      // ID consistency between the main binary and nested frameworks.
      // Returning an empty signatureFlags array here disables hardened
      // runtime end-to-end, which lets the ad-hoc-signed main binary
      // load the ad-hoc-signed Electron Framework without complaint.
      // We don't notarize, so hardened runtime offers no benefit.
      optionsForFile: () => ({
        hardenedRuntime: false,
        signatureFlags: [],
        entitlements: undefined,
      }),
    });
    console.log("  ✓ @electron/osx-sign completed");
  } catch (err) {
    console.error("  ✗ sign failed:", err);
    process.exit(1);
  }
})();
