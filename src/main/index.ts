import { join } from "node:path";
import { app, BrowserWindow, Menu, shell } from "electron";
import { registerIpc } from "./ipc";

if (process.env.FATHOM_DATA_DIR) app.setPath("userData", process.env.FATHOM_DATA_DIR);

let main: BrowserWindow | null = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: "#0c0c0d",
    title: "Fathom",
    icon: app.isPackaged ? undefined : join(__dirname, "../../build/icon.png"),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0c0c0d", symbolColor: "#8a8a86", height: 40 },
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.control && input.shift && input.key.toLowerCase() === "i") {
      win.webContents.toggleDevTools();
    }
  });
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (main) {
      if (main.isMinimized()) main.restore();
      main.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    registerIpc();
    main = createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) main = createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
