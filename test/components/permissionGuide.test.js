const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../src/components/onboarding/permissionGuideState.ts");
const rows = [
  { id: "microphone", granted: true },
  { id: "accessibility", granted: false },
  { id: "system-audio", granted: false },
  { id: "screen-context", granted: false },
];

test("guide starts at the first missing permission without requesting access", async () => {
  const { startPermissionGuide } = await load();
  assert.deepEqual(startPermissionGuide(rows), {
    current: "accessibility",
    history: [],
    skipped: [],
    attempted: [],
  });
  assert.equal(startPermissionGuide(rows.map((row) => ({ ...row, granted: true }))), null);
});

test("Next cannot bypass an ungranted permission; Skip cannot bypass microphone", async () => {
  const { startPermissionGuide, advancePermissionGuide } = await load();
  const missingMic = rows.map((row) => ({ ...row, granted: false }));
  const progress = startPermissionGuide(missingMic);
  assert.deepEqual(advancePermissionGuide(progress, missingMic, "next"), progress);
  assert.deepEqual(advancePermissionGuide(progress, missingMic, "skip"), progress);
});

test("optional skips persist and navigation omits granted or unavailable steps", async () => {
  const { startPermissionGuide, advancePermissionGuide, reconcilePermissionGuide } = await load();
  const progress = advancePermissionGuide(startPermissionGuide(rows), rows, "skip");
  assert.equal(progress.current, "system-audio");
  assert.deepEqual(progress.skipped, ["accessibility"]);
  assert.deepEqual(progress.history, ["accessibility"]);
  const allowed = rows.filter((row) => row.id !== "system-audio");
  assert.equal(reconcilePermissionGuide(progress, allowed).current, "screen-context");
  const back = advancePermissionGuide(progress, rows, "back");
  assert.equal(back.current, "accessibility");
  assert.deepEqual(back.skipped, []);
});

test("guide finishes after the final optional skip", async () => {
  const { startPermissionGuide, advancePermissionGuide } = await load();
  const progress = startPermissionGuide(rows, "screen-context");
  assert.equal(advancePermissionGuide(progress, rows, "skip"), null);
});

test("saved sessions default the guide to inactive and retain valid restart progress", async () => {
  const { createOnboardingSession, parseOnboardingSession } =
    await import("../../src/components/onboarding/flow.ts");
  const session = createOnboardingSession();
  assert.equal(session.permissionGuide, null);
  delete session.permissionGuide;
  assert.equal(parseOnboardingSession(JSON.stringify(session)).permissionGuide, null);
  const progress = {
    current: "screen-context",
    history: ["accessibility"],
    skipped: [],
    attempted: ["screen-context"],
  };
  assert.deepEqual(
    parseOnboardingSession(JSON.stringify({ ...session, permissionGuide: progress }))
      .permissionGuide,
    progress
  );
  assert.equal(
    parseOnboardingSession(
      JSON.stringify({ ...session, permissionGuide: { ...progress, current: "files" } })
    ).permissionGuide,
    null
  );
});
