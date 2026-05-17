/**
 * Electron main process for WeChat Explorer's standalone .app target.
 *
 * Architecture: we don't re-implement anything from the Next.js side. Instead,
 *   1. find a free port,
 *   2. spawn the Next.js standalone server (`.next/standalone/server.js`)
 *      as a child process using Electron itself as Node (ELECTRON_RUN_AS_NODE)
 *      — this means the better-sqlite3 binding compiled against Electron's
 *      Node ABI is the one that loads,
 *   3. wait for the port to start accepting connections,
 *   4. open a BrowserWindow pointing at http://127.0.0.1:<port>/.
 *
 * The packaged .app contains, under `Contents/Resources/app/`:
 *   - .next/standalone/        (server.js + minimal node_modules)
 *   - .next/static/            (Next.js static chunks)
 *   - public/                  (favicons, etc.)
 *   - electron/dist/main.js    (this file, compiled)
 *
 * Locked-down navigation: we block all non-localhost loads and open external
 * links in the system browser — the bundled UI must never be steered at a
 * remote URL.
 */

import { app, BrowserWindow, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import net from "node:net";

let serverProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let serverPort = 0;

/** Find an OS-allocated port on 127.0.0.1. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("could not allocate port")));
      }
    });
  });
}

/** Poll the server until it answers, or give up after ~15s. */
async function waitForServer(port: number, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.status > 0) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Next.js server didn't come up on port ${port} after ~15s`);
}

/** Resolve the path that contains the Next.js standalone build. */
function appRoot(): string {
  // Packaged: <bundle>/Contents/Resources/app/
  // Unpacked dev: project root
  if (app.isPackaged) return join(process.resourcesPath, "app");
  return join(__dirname, "..", "..");
}

async function startNextServer(port: number): Promise<ChildProcess> {
  const root = appRoot();
  const standaloneServer = join(root, ".next", "standalone", "server.js");
  if (!existsSync(standaloneServer)) {
    throw new Error(
      `Standalone Next.js server not found at ${standaloneServer}. ` +
        `Did you run \`npm run build:app\` (or \`next build\` with output: "standalone")?`,
    );
  }

  // Extend PATH so the spawned Next.js can find `wx` (Homebrew installs at
  // /opt/homebrew/bin on Apple Silicon, /usr/local/bin on Intel). Without
  // this, double-clicked .app runs inherit a minimal PATH and lib/wx.ts can't
  // locate the binary.
  const extendedPath = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    process.env.PATH ?? "",
  ]
    .filter(Boolean)
    .join(":");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: extendedPath,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    // Run Electron's bundled Node as a plain Node interpreter for this child.
    // Standalone server.js needs Node, not Electron's renderer/main bundles.
    ELECTRON_RUN_AS_NODE: "1",
  };

  const proc = spawn(process.execPath, [standaloneServer], {
    env,
    cwd: join(root, ".next", "standalone"),
    stdio: ["ignore", "inherit", "inherit"],
  });

  proc.on("error", (err) => console.error("[next-server] spawn error", err));
  proc.on("exit", (code, signal) =>
    console.error(`[next-server] exited code=${code} signal=${signal}`),
  );

  return proc;
}

function createWindow(port: number): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 500,
    title: "WeChat Explorer",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#ffffff",
    webPreferences: {
      // Renderer is just a Chromium window pointing at the local Next.js
      // server. No Node integration / no preload exposing privileged APIs.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Lock the window to 127.0.0.1:<port>. Any attempt to navigate elsewhere
  // (e.g. a link in a forwarded message) opens in the system browser instead.
  const baseHost = `127.0.0.1:${port}`;
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.host !== baseHost) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

async function boot() {
  // Dev shortcut: point Electron at an already-running `npm run dev`. Lets
  // us iterate on the UI without rebuilding the standalone bundle each time.
  // Triggered by `npm run app:dev` (sets NEXT_DEV_SERVER_URL=http://localhost:3719).
  const devUrl = process.env.NEXT_DEV_SERVER_URL;
  if (devUrl) {
    const parsed = new URL(devUrl);
    serverPort = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
    await waitForServer(serverPort);
    mainWindow = createWindow(serverPort);
    mainWindow.loadURL(devUrl);
    return;
  }

  // Production: spawn the bundled Next.js standalone server.
  serverPort = await findFreePort();
  serverProcess = await startNextServer(serverPort);
  await waitForServer(serverPort);
  mainWindow = createWindow(serverPort);
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

app.whenReady().then(() => {
  boot().catch((err) => {
    console.error("[main] boot failed", err);
    app.quit();
  });
});

app.on("activate", () => {
  // macOS: re-open window when the dock icon is clicked after all windows closed.
  if (BrowserWindow.getAllWindows().length === 0 && serverPort > 0) {
    mainWindow = createWindow(serverPort);
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
    // The child has a fast exit on SIGTERM (no in-flight requests in steady
    // state). If it doesn't, the parent process exiting will reap it anyway.
  }
});
