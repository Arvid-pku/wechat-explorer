/**
 * Detect whether the wx-cli prerequisite chain is satisfied. The app launches
 * into `/onboarding` until everything in `OnboardingState.ready === true`, at
 * which point a button on the wizard kicks the user to `/`.
 *
 * Everything here is dev-or-prod-safe: read-only filesystem + cheap shell
 * probes. No side effects.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type OnboardingStep =
  | "node"
  | "wxCli"
  | "wechatApp"
  | "wechatResigned"
  | "wechatRunning"
  | "wxKeys"
  | "indexed";

export interface OnboardingState {
  /** Node.js + npm are installed (needed for the wx-cli npm install). */
  node: boolean;
  /** `wx` is on PATH. */
  wxCli: boolean;
  /** `/Applications/WeChat.app` exists. */
  wechatApp: boolean;
  /** WeChat.app has been ad-hoc resigned (heuristic — looks for our resign signature). */
  wechatResigned: boolean | "unknown";
  /** WeChat process is currently running. */
  wechatRunning: boolean;
  /** `~/.wx-cli/all_keys.json` exists (wx init has succeeded at least once). */
  wxKeys: boolean;
  /** The explorer's index has at least one indexed message. Computed by the caller. */
  indexed?: boolean;
  /** First step that's still missing — what the UI should highlight. */
  nextStep: OnboardingStep | null;
}

/**
 * Run a shell command without inheriting stdin. Returns the trimmed stdout
 * if the exit code is 0, otherwise null. Used for `which` / `pgrep` / etc.
 */
function tryRun(cmd: string, args: string[]): string | null {
  const env = {
    ...process.env,
    PATH: [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      process.env.PATH ?? "",
    ]
      .filter(Boolean)
      .join(":"),
  };
  const res = spawnSync(cmd, args, { env, encoding: "utf8" });
  if (res.status === 0) return (res.stdout ?? "").trim();
  return null;
}

export function detectOnboardingState(): OnboardingState {
  // npm is the actual prerequisite — wx-cli ships as @jackwener/wx-cli on
  // npm, installed globally via `npm install -g`. We don't need Homebrew
  // specifically; whatever Node/npm install path the user prefers is fine.
  const node = tryRun("which", ["npm"]) !== null;
  const wxCli = tryRun("which", ["wx"]) !== null;
  const wechatApp = existsSync("/Applications/WeChat.app");
  const wechatRunning =
    tryRun("pgrep", ["-xq", "WeChat"]) !== null ||
    tryRun("pgrep", ["-f", "/Applications/WeChat.app/Contents/MacOS/WeChat"]) !== null;

  // Has the app been ad-hoc resigned? `codesign -dvv` prints the signing
  // identity. The unmodified App Store / DMG signature reads "Tencent..."; an
  // ad-hoc signature reads "Signature=adhoc". The check is heuristic — we
  // mark "unknown" if codesign isn't available, so the UI doesn't false-warn.
  let wechatResigned: boolean | "unknown" = "unknown";
  if (wechatApp) {
    const cs = spawnSync(
      "codesign",
      ["-dv", "/Applications/WeChat.app"],
      { encoding: "utf8" },
    );
    const out = `${cs.stdout ?? ""}${cs.stderr ?? ""}`;
    if (out.includes("Signature=adhoc")) wechatResigned = true;
    else if (out.match(/Authority=/)) wechatResigned = false;
  }

  const wxKeys = existsSync(join(homedir(), ".wx-cli", "all_keys.json"));

  // The chain order matches the natural flow in the UI.
  let nextStep: OnboardingStep | null = null;
  if (!node) nextStep = "node";
  else if (!wxCli) nextStep = "wxCli";
  else if (!wechatApp) nextStep = "wechatApp";
  else if (wechatResigned === false) nextStep = "wechatResigned";
  else if (!wxKeys) nextStep = "wxKeys";

  return {
    node,
    wxCli,
    wechatApp,
    wechatResigned,
    wechatRunning,
    wxKeys,
    nextStep,
  };
}

/**
 * The fixed allowlist of actions /api/onboarding/run will execute. Anything
 * not in this map is rejected — we never let the caller compose a command.
 *
 * `requiresSudo: true` actions are wrapped with `osascript -e 'do shell
 * script ... with administrator privileges'`, which surfaces the macOS
 * password dialog instead of needing a terminal-side `sudo`.
 */
export interface OnboardingAction {
  description: string;
  shell: string;
  requiresSudo: boolean;
}

export const ONBOARDING_ACTIONS: Record<string, OnboardingAction> = {
  "install-wx-cli": {
    description: "Install wx-cli via npm",
    // The real upstream is @jackwener/wx-cli on npm, NOT a Homebrew tap.
    // No sudo needed if the user's npm prefix is user-writable (the
    // default for Homebrew node, nvm, fnm, etc.).
    shell: "npm install -g @jackwener/wx-cli",
    requiresSudo: false,
  },
  "resign-wechat": {
    description: "Ad-hoc re-sign WeChat.app so wx-cli can attach",
    shell: "codesign --force --deep --sign - /Applications/WeChat.app",
    requiresSudo: true,
  },
  "init-wx": {
    description: "Extract WeChat keys (sudo wx init)",
    shell: "wx init",
    requiresSudo: true,
  },
  "quit-wechat": {
    description: "Quit WeChat",
    shell: 'osascript -e \'tell application "WeChat" to quit\'',
    requiresSudo: false,
  },
};
