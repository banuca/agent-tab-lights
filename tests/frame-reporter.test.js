"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../lib/protocol.js");
const { createFrameReporter } = require("../lib/frame-reporter.js");
const { createWatcher } = require("../lib/watcher.js");
const {
  createClock,
  createMutationObserverClass,
  createEventEmitter
} = require("./helpers/fake-browser.js");

// A detector stand-in whose identify() and detect() a test can flip at will.
function fakeDetector({ id = "claude-code", label = "Claude Code" } = {}) {
  const state = { identified: false, detected: "idle" };

  return {
    id,
    label,
    identify: () => state.identified,
    detect: () => state.detected,
    state
  };
}

function createHarness({ candidates, sendResult = true, isEnabled } = {}) {
  const clock = createClock();
  const FakeMutationObserver = createMutationObserverClass();
  const eventTarget = createEventEmitter();
  const sent = [];
  const outcome = { ok: sendResult };
  const detectors = candidates || [fakeDetector()];

  const reporter = createFrameReporter({
    candidates: detectors,
    document: { querySelectorAll: () => [] },
    send: (payload) => {
      sent.push(payload);
      return outcome.ok;
    },
    now: clock.now,
    createWatcher: (options) =>
      createWatcher({
        ...options,
        target: { tag: "body" },
        MutationObserver: FakeMutationObserver,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        setInterval: clock.setInterval,
        clearInterval: clock.clearInterval,
        eventTarget
      }),
    heartbeatMs: protocol.heartbeatMs,
    minResendMs: protocol.heartbeatSlackMs,
    messages: protocol.messages,
    isEnabled
  });

  return {
    reporter,
    clock,
    sent,
    outcome,
    detectors,
    detector: detectors[0],
    states: () => sent.map((payload) => payload.state),
    // Drive one DOM change through the watcher's coalescing window, the way a
    // panel rendering a token would.
    mutate() {
      FakeMutationObserver.last()?.trigger();
      clock.advance(150);
    }
  };
}

test("an unidentified webview reports nothing at all", () => {
  // Injected into markdown previews and the settings editor too; reporting
  // idle from those would make them count as live agent sources.
  const harness = createHarness();

  harness.reporter.start();
  harness.clock.advance(30000);

  assert.deepEqual(harness.sent, []);
  assert.equal(harness.reporter.identified, false);
});

test("a panel that renders after injection is still picked up", () => {
  // The bug this whole module exists for: document_idle in a webview fires
  // before the panel's app has rendered, and identifying once meant the frame
  // stayed silent for its entire life.
  const harness = createHarness();

  harness.reporter.start();
  assert.equal(harness.reporter.identified, false);

  harness.detector.state.identified = true;
  harness.detector.state.detected = "working";
  harness.clock.advance(protocol.heartbeatMs);

  assert.equal(harness.reporter.identified, true);
  assert.deepEqual(harness.states(), ["working"]);
});

test("identification is retried at most once per second", () => {
  let attempts = 0;
  const detector = {
    id: "claude-code",
    label: "Claude Code",
    identify: () => {
      attempts += 1;
      return false;
    },
    detect: () => "idle"
  };

  const harness = createHarness({ candidates: [detector] });

  harness.reporter.start();
  const afterStart = attempts;

  // A burst of mutations in a busy non-agent webview must not turn into a
  // querySelectorAll storm: ten changes inside one second, one identify.
  for (let i = 0; i < 10; i += 1) {
    harness.mutate();
  }

  assert.ok(attempts - afterStart <= 1, `identified ${attempts} times`);
});

test("a webview that never identifies eventually stops watching", () => {
  const harness = createHarness();

  harness.reporter.start();
  harness.clock.advance(600001 + protocol.heartbeatMs);

  assert.equal(harness.reporter.stopped, true);
});

test("the first provider to identify wins", () => {
  const first = fakeDetector({ id: "claude-code", label: "Claude Code" });
  const second = fakeDetector({ id: "generic-agent", label: "Agent" });
  second.state.identified = true;

  const harness = createHarness({ candidates: [first, second] });

  harness.reporter.start();

  assert.equal(harness.reporter.detectorId, "generic-agent");
});

test("state changes are reported immediately", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  assert.deepEqual(harness.states(), ["idle"]);

  harness.detector.state.detected = "working";
  harness.mutate();

  assert.deepEqual(harness.states(), ["idle", "working"]);
});

test("a quiet panel still heartbeats on every safety tick", () => {
  // Timer jitter means the interval lands a hair under heartbeatMs. Comparing
  // against the full heartbeat dropped every other send and silently halved
  // the real rate, eating the whole staleness margin.
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.clock.advance(protocol.heartbeatMs);
  harness.clock.advance(protocol.heartbeatMs);

  assert.deepEqual(harness.states(), ["idle", "idle", "idle"]);
});

test("an orphaned extension context stops the reporter for good", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  assert.equal(harness.sent.length, 1);

  harness.outcome.ok = false;
  harness.detector.state.detected = "working";
  harness.mutate();

  assert.equal(harness.reporter.stopped, true);

  harness.detector.state.detected = "idle";
  harness.clock.advance(60000);

  assert.equal(harness.sent.length, 2);
});

test("becoming visible again forces a fresh report", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.reporter.resume();

  assert.deepEqual(harness.states(), ["idle", "idle"]);
});

test("teardown withdraws the frame so the tab clears at once", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.reporter.teardown();

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.type, protocol.messages.frameGone);
  assert.equal(last.detectorId, "claude-code");
});

test("teardown of an unidentified frame announces nothing", () => {
  const harness = createHarness();

  harness.reporter.start();
  harness.reporter.teardown();

  assert.deepEqual(harness.sent, []);
});

test("a bfcache restore re-announces the panel", () => {
  // pagehide withdrew the frame. Without a restart the panel stays dark until
  // it is closed and reopened.
  const harness = createHarness();
  harness.detector.state.identified = true;
  harness.detector.state.detected = "working";

  harness.reporter.start();
  harness.reporter.teardown();
  assert.equal(harness.reporter.stopped, true);

  harness.reporter.restart();

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.type, protocol.messages.frameState);
  assert.equal(last.state, "working");
  assert.equal(harness.reporter.stopped, false);
});

test("a restart re-identifies rather than trusting the old detector", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.reporter.teardown();

  // The panel was replaced by something else while the page was cached.
  harness.detector.state.identified = false;
  harness.reporter.restart();

  assert.equal(harness.reporter.identified, false);
});

test("an orphaned reporter stays dead through a restart", () => {
  // The extension really is gone; retrying forever would burn cycles on a page
  // that can never report again.
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.outcome.ok = false;
  harness.detector.state.detected = "working";
  harness.mutate();

  const sentWhenOrphaned = harness.sent.length;
  harness.reporter.restart();
  harness.clock.advance(30000);

  assert.equal(harness.sent.length, sentWhenOrphaned);
});

test("starting twice does not leave two watchers reporting", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;

  harness.reporter.start();
  harness.reporter.start();

  const before = harness.sent.length;
  harness.clock.advance(protocol.heartbeatMs);

  assert.equal(harness.sent.length - before, 1);
});

test("a disabled provider reports nothing", () => {
  const harness = createHarness({ isEnabled: () => false });
  harness.detector.state.identified = true;
  harness.detector.state.detected = "working";

  harness.reporter.start();
  harness.clock.advance(10000);

  assert.deepEqual(harness.sent, []);
});

test("turning a provider off withdraws it rather than going quiet", () => {
  // Silence alone would leave the light on until the staleness window expired.
  const harness = createHarness();
  harness.detector.state.identified = true;
  harness.detector.state.detected = "working";

  harness.reporter.start();
  harness.reporter.setEnabled(false);

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.type, protocol.messages.frameGone);
});

test("turning a provider back on resumes reporting", () => {
  const harness = createHarness();
  harness.detector.state.identified = true;
  harness.detector.state.detected = "working";

  harness.reporter.start();
  harness.reporter.setEnabled(false);
  harness.reporter.setEnabled(true);

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.type, protocol.messages.frameState);
  assert.equal(last.state, "working");
});
