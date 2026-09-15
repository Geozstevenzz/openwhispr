const assert = require("node:assert/strict");
const test = require("node:test");

async function fixture(permission = "accessibility") {
  const { createPermissionGuideController } =
    await import("../../src/components/onboarding/permissionGuideController.ts");
  const calls = [],
    states = [],
    saves = [];
  let finish;
  let granted = false;
  let closed = 0;
  const rows = [
    {
      id: permission,
      granted: false,
      request: () => {
        assert.equal(saves.at(-1).current, permission);
        calls.push("request");
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      check: async () => {
        calls.push("check");
        return { granted };
      },
      verify: async () => {
        calls.push("verify");
        return { granted };
      },
      openSettings: async () => {
        calls.push("settings");
      },
    },
  ];
  const controller = createPermissionGuideController({
    sessionId: "test",
    rows: () => rows,
    save: (value) => saves.push(value),
    publish: async (state) => {
      states.push(state);
      return true;
    },
    close: () => {
      closed++;
    },
    restart: async () => {
      calls.push("restart");
    },
  });
  return {
    controller,
    calls,
    states,
    saves,
    rows,
    finish: () => finish(),
    grant: () => {
      granted = true;
    },
    closed: () => closed,
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("one Enable click requests access immediately, before showing the Settings helper", async () => {
  const setup = await fixture();
  const pending = setup.controller.start("accessibility");
  await tick();
  assert.deepEqual(setup.calls, ["request"]);
  assert.equal(setup.states.length, 0);
  setup.finish();
  await pending;
  assert.equal(setup.states.at(-1).permission, "accessibility");
  assert.deepEqual(setup.calls, ["request", "check"]);
});

test("the helper stays out of the native microphone prompt and never appears after Allow", async () => {
  const setup = await fixture("microphone");
  const pending = setup.controller.start("microphone");
  await tick();
  assert.equal(setup.states.length, 0);
  setup.grant();
  setup.finish();
  await pending;
  assert.equal(setup.states.length, 0);
  assert.equal(setup.saves.at(-1), null);
});

test("denied microphone access shows only the Settings recovery helper", async () => {
  const setup = await fixture("microphone");
  const pending = setup.controller.start("microphone");
  setup.finish();
  await pending;
  assert.equal(setup.states.at(-1).permission, "microphone");
});

test("permission recognition dismisses the overlay without moving to another permission", async () => {
  const setup = await fixture();
  const pending = setup.controller.start("accessibility");
  setup.finish();
  await pending;
  setup.rows.push({ ...setup.rows[0], id: "system-audio" });
  setup.grant();
  await setup.controller.refresh();
  assert.equal(setup.saves.at(-1), null);
  assert.equal(setup.calls.filter((call) => call === "request").length, 1);
});

test("resuming saved intent checks permission without repeating a native request", async () => {
  const setup = await fixture();
  await setup.controller.start(undefined, { current: "accessibility" });
  assert.deepEqual(setup.calls, ["check"]);
  assert.equal(setup.states.length, 1);
});

test("duplicate clicks and late results cannot revive a dismissed helper", async () => {
  const setup = await fixture();
  const pending = setup.controller.start("accessibility");
  await setup.controller.start("accessibility");
  assert.deepEqual(setup.calls, ["request"]);
  await setup.controller.act({ sessionId: "old", permission: "accessibility", action: "close" });
  assert.equal(setup.closed(), 0);
  await setup.controller.act({ sessionId: "test", permission: "accessibility", action: "close" });
  setup.finish();
  await pending;
  assert.equal(setup.states.length, 0);
  assert.equal(setup.saves.at(-1), null);
});

test("policy removal cancels an in-flight request instead of advancing to another permission", async () => {
  const setup = await fixture();
  const pending = setup.controller.start("accessibility");
  setup.rows.length = 0;
  await setup.controller.reconcile();
  setup.finish();
  await pending;
  assert.equal(setup.states.length, 0);
  assert.deepEqual(setup.calls, ["request"]);
});

test("System Audio checks only on demand, without reopening Settings or recording loops", async () => {
  const setup = await fixture("system-audio");
  const pending = setup.controller.start("system-audio");
  setup.finish();
  await pending;
  setup.calls.length = 0;
  await setup.controller.refresh();
  assert.deepEqual(setup.calls, []);
  setup.grant();
  await setup.controller.act({ sessionId: "test", permission: "system-audio", action: "check" });
  assert.deepEqual(setup.calls, ["verify"]);
  assert.equal(setup.saves.at(-1), null);
});

test("a screen grant that requires restart retains the compact restart controls", async () => {
  const setup = await fixture("screen-context");
  setup.rows[0].check = async () => ({ granted: true, needsRelaunch: true });
  const pending = setup.controller.start("screen-context");
  setup.finish();
  await pending;
  assert.equal(setup.states.at(-1).needsRelaunch, true);
  await setup.controller.act({
    sessionId: "test",
    permission: "screen-context",
    action: "restart",
  });
  assert.ok(setup.calls.includes("restart"));
});

test("Settings launch failures expose a retry and never restart the native request", async () => {
  const setup = await fixture();
  setup.rows[0].request = async () => {
    throw new Error("Settings unavailable");
  };
  await setup.controller.start("accessibility");
  assert.equal(setup.states.at(-1).error, true);
  await setup.controller.refresh();
  assert.equal(setup.states.at(-1).error, true);
  await setup.controller.act({
    sessionId: "test",
    permission: "accessibility",
    action: "settings",
  });
  assert.deepEqual(setup.calls, ["check", "settings"]);
  assert.equal(setup.states.at(-1).error, false);
});

test("screen consent is not applied by a stale result after cancellation", async () => {
  const setup = await fixture("screen-context");
  setup.rows[0].onGranted = () => setup.calls.push("consent");
  let finishCheck;
  setup.rows[0].check = () =>
    new Promise((resolve) => {
      finishCheck = resolve;
    });
  const pending = setup.controller.start("screen-context");
  setup.finish();
  await tick();
  await setup.controller.act({ sessionId: "test", permission: "screen-context", action: "close" });
  finishCheck({ granted: true });
  await pending;
  assert.ok(!setup.calls.includes("consent"));
});
