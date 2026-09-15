const assert = require("node:assert/strict");
const test = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("guide exposes native drag only for supported steps and keeps a keyboard alternative", async (t) => {
  installBrowserGlobals(t, { window: { electronAPI: {} } });
  const server = await createRendererServer(t, {
    cachePrefix: "permission-guide-overlay-",
    noExternal: ["react-i18next"],
    mockModules: {
      "react-i18next": `export function useTranslation() { return { t: (key) => key }; }`,
    },
  });
  const { PermissionGuideCard } = await server.ssrLoadModule(
    "/components/onboarding/PermissionGuideOverlay.tsx"
  );
  const state = {
    sessionId: "guide",
    permission: "accessibility",
    position: 2,
    total: 4,
    granted: false,
    needsRelaunch: false,
    busy: false,
    attempted: true,
    canGoBack: true,
    error: false,
    canDrag: true,
  };
  const render = (overrides) =>
    renderToStaticMarkup(
      React.createElement(PermissionGuideCard, {
        state: { ...state, ...overrides },
        onAction() {},
        onDrag() {},
      })
    );
  const drag = render({});
  assert.match(drag, /draggable="true"/);
  assert.match(drag, /onboarding.permissionGuide.missingApp/);
  assert.doesNotMatch(
    drag,
    /onboarding.permissionGuide.progress|onboarding.permissionGuide.start|common.next|common.skip|<h1/
  );
  assert.doesNotMatch(drag, /onboarding.rehaul.permissions.enable|Description|description/);
  const microphone = render({ permission: "microphone", canDrag: false });
  assert.doesNotMatch(microphone, /draggable="true"/);
  assert.doesNotMatch(microphone, /common.skip/);
  const restart = render({ permission: "screen-context", granted: true, needsRelaunch: true });
  assert.match(restart, /onboarding.permissionGuide.restart/);
  assert.match(restart, /onboarding.permissionGuide.return/);
  const cachedAudio = render({ permission: "system-audio", granted: true, attempted: false });
  assert.match(cachedAudio, /onboarding.permissionGuide.check/);
});
