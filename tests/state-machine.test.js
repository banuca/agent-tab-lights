"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createStateMachine } = require("../lib/state-machine.js");

// Timers are injected rather than real so the 1200ms completion delay can be
// exercised without waiting for it.
function createClock() {
  const pending = new Map();
  let nextId = 0;

  return {
    setTimeout(callback) {
      nextId += 1;
      pending.set(nextId, callback);
      return nextId;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
    flush() {
      const callbacks = Array.from(pending.values());
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
    get pendingCount() {
      return pending.size;
    }
  };
}

function createHarness({ state = "idle", url = "https://example.test/a" } = {}) {
  const clock = createClock();
  const rendered = [];
  const current = { state, url };

  const machine = createStateMachine({
    detect: () => current.state,
    render: (value) => rendered.push(value),
    getUrl: () => current.url,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout
  });

  return { machine, clock, rendered, current };
}

test("shows working while the detector reports work", () => {
  const { machine, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  assert.equal(machine.state, "working");
});

test("does not turn green until the idle period has elapsed", () => {
  const { machine, clock, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "idle";
  machine.evaluate();

  // Still orange: the completion delay is what makes green trustworthy.
  assert.equal(machine.state, "working");
  assert.equal(clock.pendingCount, 1);

  clock.flush();

  assert.equal(machine.state, "done");
});

test("never turns green when no work was ever observed", () => {
  const { machine, clock } = createHarness({ state: "idle" });

  machine.evaluate();

  assert.equal(machine.state, "idle");
  assert.equal(clock.pendingCount, 0);
});

test("abandons a pending completion when work resumes", () => {
  const { machine, clock, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "idle";
  machine.evaluate();
  assert.equal(clock.pendingCount, 1);

  current.state = "working";
  machine.evaluate();

  assert.equal(clock.pendingCount, 0);
  assert.equal(machine.state, "working");
});

test("re-evaluates instead of committing when work restarts before the timer fires", () => {
  const { machine, clock, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "idle";
  machine.evaluate();

  // Work restarts without an intervening evaluate(), so the timer itself has to
  // notice the detector no longer reports idle.
  current.state = "working";
  clock.flush();

  assert.equal(machine.state, "working");
});

test("resets to idle when the conversation changes", () => {
  const { machine, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "idle";
  current.url = "https://example.test/b";
  machine.evaluate();

  assert.equal(machine.state, "idle");
  assert.equal(machine.observedWork, false);
});

test("discards a completion that lands after navigating away", () => {
  const { machine, clock, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "idle";
  machine.evaluate();

  current.url = "https://example.test/b";
  clock.flush();

  assert.equal(machine.state, "idle");
});

test("waiting for input takes priority over completion", () => {
  const { machine, clock, current } = createHarness();

  current.state = "working";
  machine.evaluate();

  current.state = "waiting";
  machine.evaluate();

  assert.equal(machine.state, "waiting");
  assert.equal(clock.pendingCount, 0);
});

test("renders on every evaluation so a clobbered title is restored", () => {
  const { machine, rendered, current } = createHarness();

  current.state = "idle";
  machine.evaluate();
  machine.evaluate();
  machine.evaluate();

  assert.deepEqual(rendered, ["idle", "idle", "idle"]);
});
