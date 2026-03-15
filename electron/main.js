const { app, BrowserWindow, shell, dialog, Menu, Tray, nativeImage } = require("electron");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const net = require("net");
const http = require("http");

// ─── Config ────────────────────────────────────────────────────────
let mainWindow;
let nextServer;

const isDev = process.env.NODE_ENV === "development";
const PORT = isDev ? 3000 : 3123;
const PROTOCOL = "cockpit";

const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

// ─── Next.js Server ────────────────────────────────────────────────
function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextBin = path.join(APP_ROOT, "node_modules", ".bin", "next");

    nextServer = spawn(nextBin, ["start", "--port", String(PORT)], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
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
      // If Next.js crashes while app is running, show error
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
        font-family: "SF Mono", Monaco, Inconsolata, monospace;
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

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

  return mainWindow;
}

// ─── App Menu ──────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
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
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Deep Link Protocol (cockpit://) ────────────────────────────────
// Register as default handler for cockpit:// URLs
if (process.defaultApp) {
  // Dev: register with full path to electron binary
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle the deep link URL — forward OAuth callback to Next.js server
function handleDeepLink(url) {
  if (!url) return;
  console.log("[electron] deep link:", url);

  // cockpit://oauth/callback?code=xxx&state=yyy
  // → forward to http://localhost:{PORT}/api/datasources/callback?code=xxx&state=yyy
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "oauth" && parsed.pathname.startsWith("/callback")) {
      const forwardUrl = `http://localhost:${PORT}/api/datasources/callback${parsed.search}`;

      // Hit the local Next.js callback endpoint
      http.get(forwardUrl, (res) => {
        console.log("[electron] OAuth callback forwarded, status:", res.statusCode);
        // Bring Cockpit window to front
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

// macOS: open-url event fires when app is already running
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: deep link URL comes as process argument
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // On Windows, the deep link URL is the last argument
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

  if (isDev) {
    // Dev mode: Next.js dev server should already be running on :3000
    createMainWindow();
    mainWindow.show();
    return;
  }

  // Production: show splash, start server, then show main window
  const splash = createSplash();

  try {
    await startNextServer();

    createMainWindow();

    mainWindow.once("ready-to-show", () => {
      splash.close();
      mainWindow.show();
    });

    // Fallback: if ready-to-show doesn't fire within 10s, show anyway
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
  app.isQuitting = true;
  if (nextServer) nextServer.kill();
  app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (nextServer) nextServer.kill();
});

app.on("activate", () => {
  if (mainWindow === null) {
    createMainWindow();
    mainWindow.show();
  }
});
