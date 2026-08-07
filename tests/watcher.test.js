"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWatcher, watchedAttributes } = require("../lib/watcher.js");
const {
  createClock,
  createMutationObserverClass,
  createEventEmitter
} = require("./helpers/fake-browser.js");

function createHarness({ evaluationDelayMs = 100, safetyIntervalMs = 3000 } = {}) {
  const clock = createClock();
  const FakeMutationObserver = createMutationObserverClass();
  const eventTarget = createEventEmitter();
  const reasons = [];
  const target = { tag: "html" };

  const watcher = createWatcher({
    onChange: (reason) => reasons.push(reason),
    target,
    MutationObserver: FakeMutationObserver,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    eventTarget,
    evaluationDelayMs,
    safetyIntervalMs
  });

  return { watcher, clock, FakeMutationObserver, eventTarget, reasons, target };
}

test("fires once on start and observes the target", () => {
  const { watcher, FakeMutationObserver, reasons, target } = createHarness();

  watcher.start();

  assert.deepEqual(reasons, ["start"]);

  const observer = FakeMutationObserver.last();
  assert.equal(observer.targets.length, 1);
  assert.equal(observer.targets[0].target, target);
  assert.deepEqual(
    observer.targets[0].options.attributeFilter,
    watchedAttributes.slice()
  );
});

test("coalesces a burst of mutations into one evaluation", () => {
  const { watcher, clock, FakeMutationObserver, reasons } = createHarness();

  watcher.start();

  const observer = FakeMutationObserver.last();
  observer.trigger();
  observer.trigger();
  observer.trigger();

  // Nothing yet: the whole point of the coalesce window.
  assert.deepEqual(reasons, ["start"]);

  clock.advance(100);

  assert.deepEqual(reasons, ["start", "mutation"]);
});

test("the safety interval catches changes the observer cannot see", () => {
  const { watcher, clock, reasons } = createHarness();

  watcher.start();
  clock.advance(3000);
  clock.advance(3000);

  assert.deepEqual(reasons, ["start", "interval", "interval"]);
});

test("stop disconnects the observer and cancels both timers", () => {
  const { watcher, clock, FakeMutationObserver, reasons } = createHarness();

  watcher.start();
  FakeMutationObserver.last().trigger();
  watcher.stop();

  assert.equal(FakeMutationObserver.last().disconnected, true);
  assert.equal(clock.pendingCount, 0);

  clock.advance(10000);

  assert.deepEqual(reasons, ["start"]);
});

test("pagehide stops the watcher", () => {
  const { watcher, clock, eventTarget, reasons } = createHarness();

  watcher.start();
  eventTarget.dispatch("pagehide");
  clock.advance(10000);

  assert.deepEqual(reasons, ["start"]);
  assert.equal(watcher.running, false);
});

test("restarting after a bfcache restore does not stack observers", () => {
  const { watcher, clock, FakeMutationObserver, eventTarget, reasons } =
    createHarness();

  watcher.start();
  eventTarget.dispatch("pagehide");

  watcher.start();
  clock.advance(3000);

  // One interval tick, not two: the first watcher's timers are gone.
  assert.deepEqual(reasons, ["start", "start", "interval"]);
  assert.equal(FakeMutationObserver.instances.length, 2);
  assert.equal(FakeMutationObserver.instances[0].disconnected, true);
});

test("stopping releases the pagehide listener", () => {
  // Settings toggles build a fresh watcher each time. Leaving the old
  // listener behind would pin every dead watcher for the life of the page.
  const { watcher, eventTarget } = createHarness();

  watcher.start();
  assert.equal(eventTarget.listenerCount("pagehide"), 1);

  watcher.stop();
  assert.equal(eventTarget.listenerCount("pagehide"), 0);

  watcher.start();
  watcher.stop();
  assert.equal(eventTarget.listenerCount("pagehide"), 0);
});

test("a mutation arriving after stop does not schedule work", () => {
  const { watcher, clock, FakeMutationObserver, reasons } = createHarness();

  watcher.start();

  const observer = FakeMutationObserver.last();
  watcher.stop();
  observer.trigger();
  clock.advance(1000);

  assert.deepEqual(reasons, ["start"]);
});
