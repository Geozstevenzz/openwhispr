const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TRAY_GUID = "eb809902-04b5-5b08-b12a-f81d6f27e185";
const POSITION_KEY = `NSStatusItem Preferred Position ${TRAY_GUID}`;
const trayPath = path.join(__dirname, "../../src/helpers/tray.js");
const traySource = fs.readFileSync(trayPath, "utf8");

function loadTrayManager(platform, { registrationError } = {}) {
  const calls = [];
  const registrations = [];
  const preferenceWrites = [];
  const warnings = [];
  const errors = [];
  const instances = [];
  const icon = { isEmpty: () => false };
  const electron = {
    Tray: class FakeTray {
      constructor(...args) {
        calls.push("construct");
        this.args = args;
        this.listeners = new Map();
        this.ignoreDoubleClickCalls = [];
        instances.push(this);
      }
      setIgnoreDoubleClickEvents(value) {
        this.ignoreDoubleClickCalls.push(value);
      }
      setToolTip(value) {
        this.tooltip = value;
      }
      setContextMenu(value) {
        this.menu = value;
      }
      on(event, listener) {
        this.listeners.set(event, listener);
      }
    },
    Menu: { buildFromTemplate: (template) => ({ template }) },
    nativeImage: {},
    app: {},
    systemPreferences: {
      registerDefaults(defaults) {
        calls.push("register");
        registrations.push({ ...defaults });
        if (registrationError) throw registrationError;
      },
      setUserDefault(...args) {
        preferenceWrites.push(["set", ...args]);
      },
      removeUserDefault(...args) {
        preferenceWrites.push(["remove", ...args]);
      },
    },
  };
  const logger = {
    info() {},
    debug() {},
    warn: (...args) => warnings.push(args),
    error: (...args) => errors.push(args),
  };
  const loadedModule = { exports: {} };
  vm.runInNewContext(traySource, {
    module: loadedModule,
    __dirname: path.dirname(trayPath),
    process: { platform, env: {} },
    require(specifier) {
      if (specifier === "electron") return electron;
      if (specifier === "./debugLogger") return logger;
      if (specifier === "./dockManager") return {};
      if (specifier === "./i18nMain") return { i18nMain: { t: (key) => key } };
      if (specifier === "path" || specifier === "fs") return require(specifier);
      throw new Error(`Unexpected tray dependency: ${specifier}`);
    },
  });
  const manager = new loadedModule.exports();
  manager.loadTrayIcon = async () => icon;
  return {
    manager,
    icon,
    calls,
    registrations,
    preferenceWrites,
    warnings,
    errors,
    instances,
  };
}

function assertUsableTray(harness) {
  assert.equal(harness.instances.length, 1);
  assert.equal(harness.manager.tray, harness.instances[0]);
  assert.equal(harness.manager.tray.tooltip, "tray.tooltip");
  assert.ok(harness.manager.tray.menu.template.length > 0);
  assert.equal(harness.manager.tray.listeners.has("destroyed"), true);
  assert.deepEqual(harness.errors, []);
}

test("macOS registers a rightward fallback before creating its named tray", async () => {
  const harness = loadTrayManager("darwin");
  await harness.manager.createTray();

  assertUsableTray(harness);
  assert.deepEqual(harness.calls, ["register", "construct"]);
  assert.deepEqual(harness.registrations, [{ [POSITION_KEY]: 0 }]);
  assert.deepEqual(harness.manager.tray.args, [harness.icon, TRAY_GUID]);
  assert.deepEqual(harness.manager.tray.ignoreDoubleClickCalls, [true]);
  assert.equal(harness.manager.tray.listeners.has("click"), false);
  assert.deepEqual(harness.preferenceWrites, []);
});

test("independent launches keep the same macOS identity without writing saved positions", async () => {
  for (let launch = 0; launch < 2; launch += 1) {
    const harness = loadTrayManager("darwin");
    await harness.manager.createTray();

    assertUsableTray(harness);
    assert.equal(harness.manager.tray.args[1], TRAY_GUID);
    assert.deepEqual(harness.registrations, [{ [POSITION_KEY]: 0 }]);
    assert.deepEqual(harness.preferenceWrites, []);
  }
});

test("a macOS placement preference failure still creates a working named tray", async () => {
  const harness = loadTrayManager("darwin", {
    registrationError: new Error("registration unavailable"),
  });
  await harness.manager.createTray();

  assertUsableTray(harness);
  assert.deepEqual(harness.calls, ["register", "construct"]);
  assert.deepEqual(harness.manager.tray.args, [harness.icon, TRAY_GUID]);
  assert.deepEqual(harness.manager.tray.ignoreDoubleClickCalls, [true]);
  assert.equal(harness.warnings.length, 1);
  assert.equal(harness.warnings[0][1].error, "registration unavailable");
  assert.equal(harness.warnings[0][2], "tray");
  assert.deepEqual(harness.preferenceWrites, []);
});

for (const platform of ["win32", "linux"]) {
  test(`${platform} keeps its existing constructor and click behavior`, async () => {
    const harness = loadTrayManager(platform);
    await harness.manager.createTray();

    assertUsableTray(harness);
    assert.deepEqual(harness.calls, ["construct"]);
    assert.deepEqual(harness.manager.tray.args, [harness.icon]);
    assert.deepEqual(harness.registrations, []);
    assert.deepEqual(harness.preferenceWrites, []);
    assert.deepEqual(harness.manager.tray.ignoreDoubleClickCalls, []);
    assert.equal(harness.manager.tray.listeners.has("click"), true);
    let toggles = 0;
    harness.manager.toggleControlPanelFromTray = async () => {
      toggles += 1;
    };
    harness.manager.tray.listeners.get("click")();
    assert.equal(toggles, 1);
  });
}

test("an empty tray image does not register a preference or construct a tray", async () => {
  const harness = loadTrayManager("darwin");
  harness.manager.loadTrayIcon = async () => ({ isEmpty: () => true });
  await harness.manager.createTray();

  assert.equal(harness.manager.tray, null);
  assert.deepEqual(harness.calls, []);
  assert.deepEqual(harness.preferenceWrites, []);
  assert.equal(harness.errors.length, 1);
});
