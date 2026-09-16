const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { createRoot } = require("react-dom/client");
const {
  createRendererServer,
  installBrowserGlobals,
  installHookDom,
} = require("../lib/rendererTestHarness");

async function mount(t) {
  let root;
  t.after(async () => {
    if (root) await React.act(async () => root.unmount());
  });
  const requests = [];
  const denialSubscribers = new Set();
  installBrowserGlobals(t, {
    window: {
      electronAPI: {
        onLinuxPttPermissionDenied: (callback) => {
          denialSubscribers.add(callback);
          return () => denialSubscribers.delete(callback);
        },
        getHotkeyModeInfo: (hotkey, slot) =>
          new Promise((resolve) => requests.push({ hotkey, slot, resolve })),
      },
    },
  });
  const container = installHookDom(t);
  const vite = await createRendererServer(t);
  const { useHotkeyModeInfo } = await vite.ssrLoadModule("/hooks/useHotkeyModeInfo.ts");
  let hotkey = "RightCommand";
  let result;
  function Harness() {
    result = useHotkeyModeInfo("settings", hotkey, "dictation");
    return null;
  }
  root = createRoot(container);
  const render = async (key = hotkey) => {
    hotkey = key;
    await React.act(async () => root.render(React.createElement(Harness)));
  };
  const resolve = async (index, supportsPushToTalk, linuxPttPermissionDenied = false) => {
    await React.act(async () => {
      requests[index].resolve({
        isUsingNativeShortcut: true,
        isUsingHyprland: false,
        supportsPushToTalk,
        linuxPttPermissionDenied,
        pushToTalkUnavailableReason: supportsPushToTalk ? null : "This shortcut cannot Hold",
      });
    });
  };
  await render();
  return {
    render,
    resolve,
    result: () => result,
    requests,
    subscribers: () => denialSubscribers.size,
    deny: async () => {
      await React.act(async () => {
        for (const callback of denialSubscribers) callback();
      });
    },
    remount: async () => {
      await React.act(async () => root.unmount());
      root = createRoot(container);
      await render();
    },
    unmount: async () => {
      await React.act(async () => root.unmount());
      root = null;
    },
  };
}

test("an edited shortcut is unresolved until its own capability answer arrives", async (t) => {
  const h = await mount(t);
  assert.equal(h.result().loaded, false);
  await h.resolve(0, true);
  assert.equal(h.result().loaded, true);
  await h.render("Control+Super");
  assert.equal(h.result().loaded, false, "the previous key's Hold support is not current");
  assert.equal(h.result().isUsingNativeShortcut, true, "editor backend limits remain stable");
  await h.resolve(1, false);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().supportsPushToTalk, false);
});

test("a late answer for a replaced shortcut cannot restore stale guidance", async (t) => {
  const h = await mount(t);
  await h.render("F9");
  await h.resolve(0, true);
  assert.equal(h.result().loaded, false);
  await h.resolve(1, false);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().supportsPushToTalk, false);
});

test("returning to an earlier key still waits for its fresh check", async (t) => {
  const h = await mount(t);
  await h.resolve(0, true);
  await h.render("F9");
  await h.render("RightCommand");
  assert.equal(h.result().loaded, false);
  await h.resolve(1, true);
  assert.equal(h.result().loaded, false);
  await h.resolve(2, false);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().supportsPushToTalk, false);
});

test("a saved denial is read on mount and again after reopening Settings", async (t) => {
  const h = await mount(t);
  assert.equal(h.result().linuxPttPermissionDenied, false);
  await h.resolve(0, true, true);
  assert.equal(h.result().linuxPttPermissionDenied, true);
  await h.remount();
  assert.equal(h.result().loaded, false);
  await h.resolve(1, true, true);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().linuxPttPermissionDenied, true);
});

test("a denial event rechecks capabilities and releases its subscription on unmount", async (t) => {
  const h = await mount(t);
  assert.equal(h.subscribers(), 1);
  await h.resolve(0, true);
  await h.deny();
  assert.equal(h.requests.length, 2);
  assert.equal(h.result().loaded, false);
  await h.resolve(1, true, true);
  assert.equal(h.result().linuxPttPermissionDenied, true);
  await h.unmount();
  assert.equal(h.subscribers(), 0);
  await h.deny();
  assert.equal(h.requests.length, 2);
});

test("a late pre-denial answer cannot erase a newer permission diagnostic", async (t) => {
  const h = await mount(t);
  await h.deny();
  assert.equal(h.requests.length, 2);
  await h.resolve(1, true, true);
  await h.resolve(0, true, false);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().linuxPttPermissionDenied, true);
});

test("denial refresh also supersedes an in-flight shortcut edit", async (t) => {
  const h = await mount(t);
  await h.resolve(0, true);
  await h.render("F9");
  await h.deny();
  assert.equal(h.requests.length, 3);
  await h.resolve(1, true, false);
  assert.equal(h.result().loaded, false);
  await h.resolve(2, true, true);
  assert.equal(h.result().loaded, true);
  assert.equal(h.result().linuxPttPermissionDenied, true);
});
