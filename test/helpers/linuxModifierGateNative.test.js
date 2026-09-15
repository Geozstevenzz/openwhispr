const test = require("node:test");
const assert = require("node:assert/strict");
const { runLinuxFastPasteFixture } = require("../lib/linuxFastPasteFixture");

// The modifier gate must read the key state the X server reports on an X11
// session, so strip anything that would make the helper treat this as Wayland.
const X11_SESSION_ENV = { ...process.env, XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: undefined };

test(
  "native modifier gate waits for a held modifier and ignores locked ones",
  { skip: process.platform !== "linux", timeout: 30_000 },
  async (t) => {
    const result = await runLinuxFastPasteFixture(t, "linuxModifierGate", {
      env: X11_SESSION_ENV,
    });
    if (!result) return;
    assert.match(result.stdout, /modifier gate native checks passed/);
  }
);
