const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const DevServerManager = require("./devServerManager");
const debugLogger = require("./debugLogger");

const PERMISSIONS = new Set(["microphone", "accessibility", "system-audio", "screen-context"]);
const ACTIONS = new Set([
  "enable",
  "check",
  "settings",
  "back",
  "next",
  "skip",
  "close",
  "restart",
]);

function validState(state) {
  return (
    state &&
    typeof state.sessionId === "string" &&
    state.sessionId.length > 0 &&
    state.sessionId.length <= 128 &&
    PERMISSIONS.has(state.permission) &&
    Number.isInteger(state.position) &&
    Number.isInteger(state.total) &&
    state.position >= 1 &&
    state.position <= state.total &&
    state.total <= 4 &&
    ["granted", "needsRelaunch", "busy", "attempted", "canGoBack", "error"].every(
      (key) => typeof state[key] === "boolean"
    )
  );
}

function fromWindow(event, window) {
  return (
    window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  );
}

class PermissionGuideManager {
  constructor(windowManager) {
    this.windowManager = windowManager;
    this.window = null;
    this.owner = null;
    this.state = null;
    this.bundlePath = null;
    this.icon = null;
    this.ownerGone = () => this.close(false, true);

    ipcMain.handle("permission-guide-open", (event, state) => this.open(event, state));
    ipcMain.handle("permission-guide-update", (event, state) => {
      if (
        !this.isOwner(event) ||
        !this.window ||
        !validState(state) ||
        state.sessionId !== this.state?.sessionId
      )
        return false;
      this.setState(state);
      return true;
    });
    ipcMain.handle("permission-guide-close", (event) => {
      if (!this.isOwner(event)) return false;
      this.close(true);
      return true;
    });
    ipcMain.handle("permission-guide-state", (event) =>
      fromWindow(event, this.window) ? this.snapshot() : null
    );
    ipcMain.on("permission-guide-action", (event, action) => {
      if (!fromWindow(event, this.window) || !this.matches(action) || !ACTIONS.has(action.action))
        return;
      this.sendAction(action.action);
    });
    ipcMain.on("permission-guide-drag", (event, target) => {
      if (!fromWindow(event, this.window) || !this.matches(target) || !this.snapshot()?.canDrag)
        return;
      try {
        event.sender.startDrag({ file: this.bundlePath, icon: this.icon });
      } catch (error) {
        debugLogger.warn("Permission guide drag failed", { error: error.message });
        this.setState({ ...this.state, error: true });
      }
    });
  }

  isOwner(event) {
    return (
      process.platform === "darwin" &&
      this.windowManager._onboardingActive &&
      fromWindow(event, this.windowManager.controlPanelWindow)
    );
  }

  matches(target) {
    return (
      this.windowManager._onboardingActive &&
      target &&
      this.state &&
      target.sessionId === this.state.sessionId &&
      target.permission === this.state.permission
    );
  }

  snapshot() {
    if (!this.state) return null;
    return {
      ...this.state,
      canDrag:
        !!this.bundlePath &&
        !!this.icon &&
        this.state.attempted &&
        !this.state.busy &&
        !this.state.granted &&
        ["accessibility", "screen-context"].includes(this.state.permission),
      appIcon: this.icon?.toDataURL(),
    };
  }

  setState(state) {
    // Only forward presentation fields; filesystem paths and app identity belong to main.
    this.state = Object.fromEntries(
      [
        "sessionId",
        "permission",
        "position",
        "total",
        "granted",
        "needsRelaunch",
        "busy",
        "attempted",
        "canGoBack",
        "error",
      ].map((key) => [key, state[key]])
    );
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("permission-guide-state-changed", this.snapshot());
  }

  sendAction(action) {
    if (
      this.state &&
      this.owner &&
      !this.owner.isDestroyed() &&
      !this.owner.webContents.isDestroyed()
    ) {
      this.owner.webContents.send("permission-guide-action", {
        sessionId: this.state.sessionId,
        permission: this.state.permission,
        action,
      });
    }
  }

  async open(event, state) {
    if (!this.isOwner(event) || !validState(state)) return false;
    if (this.window && !this.window.isDestroyed() && state.sessionId === this.state?.sessionId) {
      this.setState(state);
      return true;
    }
    this.close();
    const owner = this.windowManager.controlPanelWindow;
    this.owner = owner;
    const area = screen.getDisplayMatching(owner.getBounds()).workArea;
    const width = Math.min(460, area.width);
    const height = Math.min(390, area.height);
    const window = new BrowserWindow({
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.max(area.y, area.y + area.height - height - 24),
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      show: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      acceptFirstMouse: true,
      hasShadow: true,
      webPreferences: {
        preload: path.join(__dirname, "../../preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.window = window;
    this.setState(state);
    owner.on("closed", this.ownerGone);
    owner.on("hide", this.ownerGone);
    owner.webContents.on("render-process-gone", this.ownerGone);
    owner.webContents.on("did-start-navigation", this.ownerGone);
    window.on("closed", () => {
      if (this.window === window) this.close(false, true);
    });
    window.webContents.on("render-process-gone", () => {
      if (this.window === window) this.close(true, true);
    });
    window.webContents.on("will-navigate", (navigation) => navigation.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    try {
      if (app.isPackaged) {
        const executable = app.getPath("exe");
        const bundle = path.resolve(executable, "../../..");
        if (
          bundle.endsWith(".app") &&
          path.dirname(path.dirname(executable)) === path.join(bundle, "Contents") &&
          fs.existsSync(bundle)
        ) {
          const icon = await app.getFileIcon(bundle, { size: "normal" });
          if (this.window !== window || window.isDestroyed()) return false;
          if (!icon.isEmpty()) {
            this.bundlePath = bundle;
            this.icon = icon;
          }
        }
      }
      if (process.env.NODE_ENV === "development") {
        await window.loadURL(`${DevServerManager.DEV_SERVER_URL}?permission-guide=true`);
      } else {
        const file = DevServerManager.getAppFilePath(false);
        await window.loadFile(file.path, { query: { ...file.query, "permission-guide": "true" } });
      }
      if (this.window !== window || window.isDestroyed()) return false;
      window.webContents.send("permission-guide-state-changed", this.snapshot());
      window.showInactive();
      return true;
    } catch (error) {
      debugLogger.error("Could not open permission guide", { error: error.message });
      if (this.window === window) this.close(false, true);
      return false;
    }
  }

  close(restore = false, notify = false) {
    const window = this.window;
    const owner = this.owner;
    if (notify) this.sendAction("close");
    this.window = null;
    this.state = null;
    this.owner = null;
    this.bundlePath = null;
    this.icon = null;
    if (owner) {
      owner.removeListener("closed", this.ownerGone);
      owner.removeListener("hide", this.ownerGone);
      owner.webContents.removeListener("render-process-gone", this.ownerGone);
      owner.webContents.removeListener("did-start-navigation", this.ownerGone);
    }
    if (window && !window.isDestroyed()) window.close();
    if (restore && owner && !owner.isDestroyed()) {
      owner.show();
      owner.focus();
    }
  }
}

exports.PermissionGuideManager = PermissionGuideManager;
