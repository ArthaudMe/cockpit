const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const net = require("net");

let mainWindow;
let nextServer;

const isDev = process.env.NODE_ENV === "development";
const PORT = isDev ? 3000 : 3123;

// Root of the project (works both packaged and unpackaged)
const APP_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..");

function startNextServer() {
  return new Promise((resolve, reject) => {
    const nextBin = path.join(APP_ROOT, "node_modules", ".bin", "next");

    console.log("[electron] Starting Next.js from:", APP_ROOT);
    console.log("[electron] Next binary:", nextBin);

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
    }, 300);

    setTimeout(() => {
      if (!resolved) {
        clearInterval(poll);
        reject(new Error("Next.js server did not start within 15s"));
      }
    }, 15000);
  });
}

function createWindow() {
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

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    if (!isDev) {
      await startNextServer();
    }
    createWindow();
  } catch (err) {
    console.error("[electron] Startup failed:", err.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (nextServer) nextServer.kill();
  app.quit();
});

app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
