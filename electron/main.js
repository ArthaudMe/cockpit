const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");
const http = require("http");

// ─── Config ────────────────────────────────────────────────────────
let mainWindow;
let nextServer;

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const isDev = process.env.NODE_ENV === "development";
const PORT = isDev ? 3939 : 3123;
const PROTOCOL = "cockpit";

const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

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
    const response = dialog.showMessageBoxSync(mainWindow, {
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

// ─── Next.js Server ────────────────────────────────────────────────
function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextBin = isWin
      ? path.join(APP_ROOT, "node_modules", ".bin", "next.cmd")
      : path.join(APP_ROOT, "node_modules", ".bin", "next");

    nextServer = spawn(nextBin, ["start", "--port", String(PORT)], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      // Windows needs shell for .cmd scripts
      shell: isWin,
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
        .connect(PORT, "127.0.0.1", () => {
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
  const windowOpts = {
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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

  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http") && !url.includes(`localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[electron] renderer crashed:", details.reason);
    if (!app.isQuitting) {
      mainWindow.loadURL(`http://localhost:${PORT}`);
    }
  });

  mainWindow.webContents.on("unresponsive", () => {
    console.warn("[electron] window unresponsive, reloading...");
    mainWindow.webContents.reload();
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
            dialog.showMessageBox(mainWindow, {
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
  console.log("[electron] deep link:", url);

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
      const forwardUrl = `http://localhost:${PORT}/api/datasources/callback${parsed.search}`;

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

// ─── Startup ───────────────────────────────────────────────────────
app.isQuitting = false;

app.whenReady().then(async () => {
  buildMenu();
  setupAutoUpdate();

  if (isDev) {
    createMainWindow();
    mainWindow.show();
    return;
  }

  const splash = createSplash();

  try {
    await startNextServer();

    createMainWindow();

    mainWindow.once("ready-to-show", () => {
      splash.close();
      mainWindow.show();
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
  if (!isMac) {
    app.isQuitting = true;
    stopNextServer();
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
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
