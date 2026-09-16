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
  installBrowserGlobals(t, {
    window: {
      electronAPI: {
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
  const resolve = async (index, supportsPushToTalk) => {
    await React.act(async () => {
      requests[index].resolve({
        isUsingNativeShortcut: true,
        isUsingHyprland: false,
        supportsPushToTalk,
        pushToTalkUnavailableReason: supportsPushToTalk ? null : "This shortcut cannot Hold",
      });
    });
  };
  await render();
  return { render, resolve, result: () => result };
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
