const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

function fixture({ platform = "darwin", packaged = true, deferredLoad = false } = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const windows = [];
  let finishLoad;
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.sent = [];
      this.webContents.send = (...args) => this.webContents.sent.push(args);
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.mainFrame = {};
      this.webContents.startDrag = (item) => {
        this.dragged = item;
      };
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    isDestroyed() {
      return !!this.destroyed;
    }
    getBounds() {
      return { x: 100, y: 100, width: 600, height: 700 };
    }
    close() {
      this.destroyed = true;
      this.emit("closed");
    }
    showInactive() {
      this.shown = true;
    }
    show() {
      this.shown = true;
    }
    focus() {
      this.focused = true;
    }
    loadFile() {
      return deferredLoad
        ? new Promise((resolve) => {
            finishLoad = resolve;
          })
        : Promise.resolve();
    }
    loadURL() {
      return this.loadFile();
    }
  }
  const owner = new Window({});
  const windowManager = { controlPanelWindow: owner, _onboardingActive: true };
  const exports = {};
  const icon = { isEmpty: () => false, toDataURL: () => "data:image/png;base64,test" };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../../src/helpers/permissionGuideManager.js"), "utf8"),
    {
      module: { exports },
      exports,
      __dirname: path.join(__dirname, "../../src/helpers"),
      process: {
        platform,
        env: {},
        execPath: "/Applications/OpenWhispr.app/Contents/MacOS/OpenWhispr",
      },
      require: (name) => {
        if (name === "electron")
          return {
            BrowserWindow: Window,
            app: {
              isPackaged: packaged,
              getPath: () => "/Applications/OpenWhispr.app/Contents/MacOS/OpenWhispr",
              getFileIcon: async () => icon,
            },
            screen: {
              getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
            },
            ipcMain: {
              handle: (name, handler) => handlers.set(name, handler),
              on: (name, handler) => listeners.set(name, handler),
            },
          };
        if (name === "./devServerManager")
          return { getAppFilePath: () => ({ path: "/app/index.html", query: {} }) };
        if (name === "./debugLogger") return { warn() {}, error() {} };
        if (name === "fs") return { existsSync: () => true };
        return require(name);
      },
    }
  );
  const manager = new exports.PermissionGuideManager(windowManager);
  const event = (win) => ({ sender: win.webContents, senderFrame: win.webContents.mainFrame });
  return {
    manager,
    handlers,
    listeners,
    windows,
    owner,
    windowManager,
    event,
    finish: () => finishLoad?.(),
  };
}

const state = {
  sessionId: "guide-1",
  permission: "accessibility",
  position: 2,
  total: 4,
  granted: false,
  needsRelaunch: false,
  busy: false,
  attempted: true,
  canGoBack: true,
  error: false,
};

test("only the onboarding owner can open a guide, and unsupported platforms do nothing", async () => {
  const setup = fixture();
  assert.equal(await setup.handlers.get("permission-guide-open")({ sender: {} }, state), false);
  assert.equal(
    await setup.handlers.get("permission-guide-open")(setup.event(setup.owner), {
      ...state,
      permission: "files",
    }),
    false
  );
  assert.equal(
    await setup.handlers.get("permission-guide-open")(
      { ...setup.event(setup.owner), senderFrame: {} },
      state
    ),
    false
  );
  const other = fixture({ platform: "win32" });
  assert.equal(
    await other.handlers.get("permission-guide-open")(other.event(other.owner), state),
    false
  );
  assert.equal(other.windows.length, 1);
});

test("actions reject stale steps and drag only the packaged application", async () => {
  const setup = fixture();
  assert.equal(
    await setup.handlers.get("permission-guide-open")(setup.event(setup.owner), state),
    true
  );
  const helper = setup.windows[1];
  setup.listeners.get("permission-guide-action")(setup.event(helper), {
    ...state,
    permission: "microphone",
    action: "settings",
  });
  assert.equal(setup.owner.webContents.sent.length, 0);
  setup.listeners.get("permission-guide-action")(setup.event(helper), {
    ...state,
    action: "settings",
  });
  assert.equal(setup.owner.webContents.sent[0][1].action, "settings");
  setup.listeners.get("permission-guide-drag")(setup.event(helper), {
    ...state,
    path: "/private/secret",
  });
  assert.equal(helper.dragged.file, "/Applications/OpenWhispr.app");
  assert.ok(helper.shown);
});

test("development guides disable dragging and owner teardown closes the helper", async () => {
  const setup = fixture({ packaged: false });
  await setup.handlers.get("permission-guide-open")(setup.event(setup.owner), state);
  const helper = setup.windows[1];
  const snapshot = setup.handlers.get("permission-guide-state")(setup.event(helper));
  assert.equal(snapshot.canDrag, false);
  setup.listeners.get("permission-guide-drag")(setup.event(helper), state);
  assert.equal(helper.dragged, undefined);
  setup.owner.emit("hide");
  assert.equal(helper.isDestroyed(), true);
  assert.equal(setup.owner.listenerCount("hide"), 0);
});

test("a helper closed while loading never reappears", async () => {
  const setup = fixture({ deferredLoad: true });
  const opening = setup.handlers.get("permission-guide-open")(setup.event(setup.owner), state);
  await new Promise((resolve) => setImmediate(resolve));
  setup.manager.close();
  setup.finish();
  assert.equal(await opening, false);
  assert.equal(setup.windows[1].shown, undefined);
});

test("helper is a compact bottom overlay that does not steal Settings focus", async () => {
  const setup = fixture();
  await setup.handlers.get("permission-guide-open")(setup.event(setup.owner), state);
  const helper = setup.windows[1];
  assert.equal(helper.options.width, 560);
  assert.equal(helper.options.height, 140);
  assert.equal(helper.options.alwaysOnTop, true);
  assert.equal(helper.focused, undefined);
  assert.ok(helper.options.y + helper.options.height <= 900);
});
