const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage, Notification: ElectronNotification } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const net = require("net");
const http = require("http");
const fs = require("fs");
const os = require("os");

// ─── Crash Reporting ─────────────────────────────────────────────
const CRASH_LOG_PATH = path.join(os.homedir(), ".cockpit", "crash-log.json");

function logCrash(entry) {
  try {
    const dir = path.join(os.homedir(), ".cockpit");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    let log = [];
    if (fs.existsSync(CRASH_LOG_PATH)) {
      try { log = JSON.parse(fs.readFileSync(CRASH_LOG_PATH, "utf-8")); } catch {}
    }
    log.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep last 50 entries
    if (log.length > 50) log = log.slice(-50);
    fs.writeFileSync(CRASH_LOG_PATH, JSON.stringify(log, null, 2));
  } catch {
    // Never let crash logging itself crash
  }
}

process.on("uncaughtException", (err) => {
  console.error("[electron] uncaughtException:", err);
  logCrash({ type: "uncaughtException", message: err.message, stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error("[electron] unhandledRejection:", message);
  logCrash({ type: "unhandledRejection", message, stack });
});

// ─── Config ────────────────────────────────────────────────────────
let mainWindow;
let nextServer;
let tray;

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const isDev = process.env.NODE_ENV === "development";
// Dev uses the fixed `next dev` port; production picks a free port at
// startup so we never collide with something already on 3000.
let serverPort = isDev ? 3939 : null;
const PROTOCOL = "cockpit";

const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

const COCKPIT_DIR = path.join(os.homedir(), ".cockpit");
const WINDOW_STATE_PATH = path.join(COCKPIT_DIR, "window-state.json");

// ─── Window State Persistence ─────────────────────────────────────
function ensureCockpitDir() {
  if (!fs.existsSync(COCKPIT_DIR)) {
    fs.mkdirSync(COCKPIT_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadWindowState() {
  try {
    if (!fs.existsSync(WINDOW_STATE_PATH)) return null;
    const raw = fs.readFileSync(WINDOW_STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveWindowState(state) {
  try {
    ensureCockpitDir();
    fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("[electron] Failed to save window state:", err.message);
  }
}

let saveStateTimeout;
function debouncedSaveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(saveStateTimeout);
  saveStateTimeout = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? loadWindowState() : mainWindow.getBounds();
    saveWindowState({
      x: bounds?.x,
      y: bounds?.y,
      width: bounds?.width || 1280,
      height: bounds?.height || 820,
      isMaximized,
    });
  }, 500);
}

// ─── Auto-Update ──────────────────────────────────────────────────
function setupAutoUpdate() {
  if (isDev || !app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available:", info.version);
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[updater] update downloaded:", info.version);
    const parentWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const response = dialog.showMessageBoxSync(parentWindow, {
      type: "info",
      title: "Update Ready",
      message: `Cockpit ${info.version} is ready to install.`,
      detail: "The update will be applied when you restart.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err.message);
  });

  // Check for updates after a short delay, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

// ─── Tray Icon ────────────────────────────────────────────────────
function createTray() {
  // Create a simple 16x16 template icon (white diamond on transparent bg)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  // Draw a filled diamond in the center (matches the Cockpit brand mark)
  const cx = 7.5, cy = 7.5, r = 5.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      const idx = (y * size + x) * 4;
      // Diamond = Manhattan distance <= radius
      if (dx + dy <= r) {
        buf[idx] = 255;     // R
        buf[idx + 1] = 255; // G
        buf[idx + 2] = 255; // B
        buf[idx + 3] = 255; // A
      }
    }
  }
  const trayIcon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  trayIcon.setTemplateImage(true); // macOS will auto-adapt to light/dark

  tray = new Tray(trayIcon);
  tray.setToolTip("Cockpit");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Cockpit",
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Click tray icon → toggle window visibility
  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── Next.js Server ────────────────────────────────────────────────
// OAuth redirect URIs are pre-registered with providers as
// http://localhost:3939/api/datasources/callback (exact match, port
// included) — so production prefers the same port as dev. If it's taken
// we fall back to a dynamic port: everything still works except adding
// NEW OAuth connections (existing tokens refresh fine).
const PREFERRED_PORT = 3939;

function getFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", (err) => {
      if (preferred) {
        // Preferred port busy — retry with an OS-assigned one
        getFreePort().then(resolve, reject);
      } else {
        reject(err);
      }
    });
    srv.listen(preferred || 0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function startNextServer() {
  serverPort = await getFreePort(PREFERRED_PORT);
  if (serverPort !== PREFERRED_PORT) {
    console.warn(
      "[electron] port %d busy — using %d; adding new OAuth connections won't work this session",
      PREFERRED_PORT,
      serverPort
    );
  }

  return new Promise((resolve, reject) => {
    // The app ships Next's standalone output (.next/standalone) — a
    // self-contained server.js with its own traced node_modules. We run it
    // with Electron's bundled Node via ELECTRON_RUN_AS_NODE=1, so no
    // external node_modules (or symlinked .bin shims) are needed.
    const serverJs = path.join(APP_ROOT, ".next", "standalone", "server.js");

    if (!fs.existsSync(serverJs)) {
      reject(new Error(`Server bundle missing at ${serverJs}`));
      return;
    }

    // Use system node if available to avoid a second Dock icon on macOS.
    // Electron's binary with ELECTRON_RUN_AS_NODE still registers as a GUI app.
    let nodeBin = process.execPath;
    let nodeEnv = { ELECTRON_RUN_AS_NODE: "1" };

    if (isMac) {
      try {
        // Electron GUI apps get a minimal PATH — extend it with common locations
        const extendedPath = [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          process.env.PATH || "",
        ].join(":");
        const systemNode = execFileSync("/usr/bin/which", ["node"], {
          encoding: "utf-8",
          env: { ...process.env, PATH: extendedPath },
        }).trim();
        if (systemNode && fs.existsSync(systemNode)) {
          nodeBin = systemNode;
          nodeEnv = {}; // Not Electron — no need for ELECTRON_RUN_AS_NODE
        }
      } catch {
        // System node not found — fall back to Electron binary
      }
    }

    nextServer = spawn(nodeBin, [serverJs], {
      cwd: path.dirname(serverJs),
      env: {
        ...process.env,
        ...nodeEnv,
        PORT: String(serverPort),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    nextServer.stdout.on("data", (data) => {
      console.log("[next]", data.toString().trim());
    });

    nextServer.stderr.on("data", (data) => {
      console.error("[next:err]", data.toString().trim());
    });

    nextServer.on("error", (err) => {
      console.error("[electron] Failed to start Next.js:", err.message);
      reject(err);
    });

    nextServer.on("exit", (code) => {
      console.log("[electron] Next.js exited with code", code);
      if (mainWindow && !app.isQuitting) {
        dialog.showErrorBox(
          "Cockpit Error",
          "The server process stopped unexpectedly. Please restart Cockpit."
        );
        app.quit();
      }
    });

    // Poll until server is ready
    let resolved = false;
    const poll = setInterval(() => {
      if (resolved) return;
      const sock = new net.Socket();
      sock
        .connect(serverPort, "127.0.0.1", () => {
          sock.destroy();
          if (!resolved) {
            resolved = true;
            clearInterval(poll);
            resolve();
          }
        })
        .on("error", () => {
          sock.destroy();
        });
    }, 200);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        clearInterval(poll);
        reject(new Error("Server did not start within 15 seconds"));
      }
    }, 15000);
  });
}

// ─── Graceful Server Shutdown ─────────────────────────────────────
function stopNextServer() {
  if (!nextServer) return;

  // Try SIGTERM first, force-kill after 3s
  if (isWin) {
    // Windows: kill process tree
    spawn("taskkill", ["/pid", String(nextServer.pid), "/T", "/F"]);
  } else {
    nextServer.kill("SIGTERM");
    setTimeout(() => {
      try { nextServer.kill("SIGKILL"); } catch {}
    }, 3000);
  }
}

// ─── Window ────────────────────────────────────────────────────────
function createSplash() {
  const splash = new BrowserWindow({
    width: 320,
    height: 200,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splash.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, "Segoe UI", Ubuntu, sans-serif;
        background: #0a0a0a;
        color: #e8e8e8;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        -webkit-app-region: drag;
      }
      .mark {
        width: 40px; height: 40px;
        border-radius: 10px;
        border: 1px solid #3a3a3a;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
        margin-bottom: 1rem;
      }
      .title { font-size: 0.8rem; font-weight: 700; margin-bottom: 0.5rem; }
      .status {
        font-size: 0.5rem;
        color: #666;
        display: flex;
        align-items: center;
        gap: 0.3rem;
      }
      .dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: #fff;
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    </style></head>
    <body>
      <div class="mark">&#9670;</div>
      <div class="title">Cockpit</div>
      <div class="status"><span class="dot"></span> Starting up...</div>
    </body>
    </html>
  `)}`
  );

  return splash;
}

function createMainWindow() {
  const savedState = loadWindowState();

  const windowOpts = {
    width: savedState?.width || 1280,
    height: savedState?.height || 820,
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  };

  // Platform-specific title bar
  if (isMac) {
    windowOpts.titleBarStyle = "hiddenInset";
    windowOpts.trafficLightPosition = { x: 16, y: 16 };
  } else {
    // Windows/Linux: use default frame with dark background
    windowOpts.autoHideMenuBar = true;
  }

  mainWindow = new BrowserWindow(windowOpts);

  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Strict URL check: only allow our own localhost server
  function isLocalAppUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" &&
        parsed.hostname === "localhost" &&
        parseInt(parsed.port, 10) === serverPort;
    } catch {
      return false;
    }
  }

  // Open external links (window.open / target=_blank) in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalAppUrl(url)) {
      return { action: "allow" };
    }
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Block in-window navigation away from the local app. A clicked link (or a
  // malicious assistant-rendered href) must not replace the app with an
  // external site — send it to the default browser instead.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocalAppUrl(url)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  // Save window state on resize/move (debounced)
  mainWindow.on("resize", debouncedSaveWindowState);
  mainWindow.on("move", debouncedSaveWindowState);

  // Hide instead of close — keep app alive in tray
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[electron] renderer crashed:", details.reason);
    logCrash({ type: "renderProcessGone", reason: details.reason, exitCode: details.exitCode });
    if (!app.isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://localhost:${serverPort}`);
    }
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.warn("[electron] window unresponsive, reloading...");
    logCrash({ type: "windowUnresponsive" });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });

  return mainWindow;
}

// ─── App Menu ──────────────────────────────────────────────────────
function buildMenu() {
  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Check for Updates...",
          click: () => autoUpdater.checkForUpdates().catch(() => {}),
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  template.push(
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        ...(isMac ? [{ role: "zoom" }] : [{ role: "maximize" }]),
        { type: "separator" },
        ...(isMac ? [{ role: "front" }] : [{ role: "close" }]),
      ],
    }
  );

  // Windows/Linux: add Help menu with update check
  if (!isMac) {
    template.push({
      label: "Help",
      submenu: [
        {
          label: "Check for Updates...",
          click: () => autoUpdater.checkForUpdates().catch(() => {}),
        },
        { type: "separator" },
        {
          label: `About ${app.name}`,
          click: () => {
            const parentWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
            dialog.showMessageBox(parentWindow, {
              type: "info",
              title: `About ${app.name}`,
              message: `${app.name} v${app.getVersion()}`,
              detail: "Pilot your company — desktop cockpit with AI co-pilot.",
            });
          },
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Deep Link Protocol (cockpit://) ────────────────────────────────
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

function handleDeepLink(url) {
  if (!url) return;
  if (!serverPort) {
    console.warn("[electron] deep link before server ready, ignoring:", url);
    return;
  }
  console.log("[electron] deep link:", url);

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
      // Only forward known-safe OAuth parameters — never pass arbitrary query strings
      const SAFE_PARAMS = ["code", "state"];
      const safeQuery = new URLSearchParams();
      for (const key of SAFE_PARAMS) {
        if (parsed.searchParams.has(key)) {
          safeQuery.set(key, parsed.searchParams.get(key));
        }
      }
      const qs = safeQuery.toString();
      const forwardUrl = `http://localhost:${serverPort}/api/datasources/callback${qs ? `?${qs}` : ""}`;

      http.get(forwardUrl, (res) => {
        console.log("[electron] OAuth callback forwarded, status:", res.statusCode);
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      }).on("error", (err) => {
        console.error("[electron] OAuth callback forward failed:", err.message);
      });
    }
  } catch (err) {
    console.error("[electron] Failed to parse deep link:", err.message);
  }
}

// macOS: open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: deep link as process argument
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ─── Background Tick ──────────────────────────────────────────────
// The main process owns all polling — the renderer is purely reactive via IPC.
let tickInterval;
let dataInterval;

function fetchJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${serverPort}${urlPath}`, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
    }).on("error", reject);
  });
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data);
  }
}

async function pollDatasourceData() {
  try {
    const data = await fetchJson("/api/datasources/data");
    sendToRenderer("datasource-data", data);
  } catch (err) {
    console.error("[electron] data poll failed:", err.message);
  }
}

async function pollBackgroundTick() {
  try {
    const tick = await fetchJson("/api/background/tick");
    if (tick.newCount > 0) {
      const notifs = await fetchJson("/api/background/notifications");
      sendToRenderer("notifications-update", notifs);
    }
  } catch (err) {
    console.error("[electron] tick failed:", err.message);
  }
}

function startBackgroundTick() {
  // Initial data fetch after a short delay (let the server settle)
  setTimeout(() => {
    pollDatasourceData();
    pollBackgroundTick();
  }, 3000);

  // Data poll every 60s, notification tick every 120s
  dataInterval = setInterval(pollDatasourceData, 60_000);
  tickInterval = setInterval(pollBackgroundTick, 120_000);
}

function stopBackgroundTick() {
  clearInterval(dataInterval);
  clearInterval(tickInterval);
}

// ─── Startup ───────────────────────────────────────────────────────
app.isQuitting = false;

app.whenReady().then(async () => {
  buildMenu();
  setupAutoUpdate();
  createTray();

  if (isDev) {
    createMainWindow();
    mainWindow.show();
    startBackgroundTick();
    return;
  }

  const splash = createSplash();

  try {
    await startNextServer();

    createMainWindow();

    mainWindow.once("ready-to-show", () => {
      splash.close();
      mainWindow.show();
      startBackgroundTick();
    });

    setTimeout(() => {
      if (splash && !splash.isDestroyed()) {
        splash.close();
      }
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
    }, 10000);
  } catch (err) {
    splash.close();
    dialog.showErrorBox(
      "Cockpit couldn't start",
      `Failed to start the server:\n\n${err.message}\n\nPlease try restarting the app.`
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Keep app alive in tray on all platforms
  // Quit is handled explicitly via tray menu or Cmd+Q
});

app.on("before-quit", () => {
  app.isQuitting = true;
  stopBackgroundTick();
  stopNextServer();
});

app.on("activate", () => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    createMainWindow();
    mainWindow.show();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
