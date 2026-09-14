const assert = require("node:assert/strict");
const test = require("node:test");

async function fixture() {
  const { createPermissionGuideController } =
    await import("../../src/components/onboarding/permissionGuideController.ts");
  const states = [];
  const saves = [];
  const calls = [];
  let resolveRequest;
  const rows = [
    {
      id: "accessibility",
      granted: false,
      request: () => {
        calls.push("request");
        return new Promise((resolve) => {
          resolveRequest = resolve;
        });
      },
      check: async () => {
        calls.push("check");
        return { granted: true };
      },
      openSettings: async () => {
        calls.push("settings");
      },
    },
  ];
  let closed = 0;
  const controller = createPermissionGuideController({
    sessionId: "guide-1",
    rows: () => rows,
    save: (progress) => {
      saves.push(progress);
    },
    publish: async (state) => {
      states.push(state);
      return true;
    },
    close: () => {
      closed++;
    },
    restart: async () => {},
  });
  return {
    controller,
    rows,
    states,
    saves,
    calls,
    finish: () => resolveRequest?.(),
    closed: () => closed,
  };
}

test("opening and refreshing a guide never request access", async () => {
  const setup = await fixture();
  await setup.controller.start();
  assert.deepEqual(setup.calls, []);
  await setup.controller.refresh();
  assert.deepEqual(setup.calls, ["check"]);
  assert.equal(setup.states.at(-1).granted, true);
});

test("permission intent is saved before requesting and a late result cannot revive a closed guide", async () => {
  const setup = await fixture();
  await setup.controller.start();
  const pending = setup.controller.act({
    sessionId: "guide-1",
    permission: "accessibility",
    action: "enable",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(setup.saves.at(-1).attempted, ["accessibility"]);
  assert.deepEqual(setup.calls, ["request"]);
  await setup.controller.act({
    sessionId: "guide-1",
    permission: "accessibility",
    action: "close",
  });
  const count = setup.states.length;
  setup.finish();
  await pending;
  assert.equal(setup.states.length, count);
  assert.equal(setup.closed(), 1);
  assert.equal(setup.saves.at(-1), null);
});

test("stale actions and duplicate Enable clicks do not request permissions", async () => {
  const setup = await fixture();
  await setup.controller.start();
  await setup.controller.act({ sessionId: "old", permission: "accessibility", action: "enable" });
  const action = { sessionId: "guide-1", permission: "accessibility", action: "enable" };
  const pending = setup.controller.act(action);
  await setup.controller.act(action);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(setup.calls, ["request"]);
  setup.finish();
  await pending;
});

test("policy removal invalidates an in-flight permission request", async () => {
  const setup = await fixture();
  await setup.controller.start();
  const pending = setup.controller.act({
    sessionId: "guide-1",
    permission: "accessibility",
    action: "enable",
  });
  await new Promise((resolve) => setImmediate(resolve));
  setup.rows.length = 0;
  await setup.controller.reconcile();
  setup.finish();
  await pending;
  assert.deepEqual(setup.calls, ["request"]);
  assert.equal(setup.closed(), 1);
});

test("cached audio grants can be explicitly verified without polling or opening Settings", async () => {
  const setup = await fixture();
  setup.rows[0].id = "system-audio";
  setup.rows[0].granted = true;
  setup.rows[0].verify = async () => {
    setup.calls.push("verify");
    return { granted: false };
  };
  await setup.controller.start("system-audio");
  await setup.controller.refresh();
  assert.deepEqual(setup.calls, []);
  await setup.controller.act({ sessionId: "guide-1", permission: "system-audio", action: "check" });
  assert.deepEqual(setup.calls, ["verify"]);
  assert.equal(setup.states.at(-1).granted, false);
});
