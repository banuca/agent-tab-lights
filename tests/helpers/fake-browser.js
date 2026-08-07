"use strict";

/*
 * Browser-shaped fakes for the parts of the runtime the pure libraries cannot
 * reach on their own: timers, MutationObserver, and window events.
 *
 * The clock is the same idea as the one in state-machine.test.js, extended with
 * intervals and a real notion of elapsed time so heartbeat and staleness logic
 * can be exercised deterministically.
 */

function createClock(startTime = 0) {
  let now = startTime;
  let nextId = 0;
  const timers = new Map();

  function schedule(callback, delay, repeating) {
    nextId += 1;
    timers.set(nextId, {
      callback,
      delay: Math.max(0, delay || 0),
      dueAt: now + Math.max(0, delay || 0),
      repeating
    });
    return nextId;
  }

  function cancel(handle) {
    timers.delete(handle);
  }

  // Runs every timer due at or before the new time, in due order, so a callback
  // that schedules more work inside the same window still fires.
  function advance(ms) {
    const target = now + ms;

    for (;;) {
      let nextHandle = null;
      let next = null;

      for (const [handle, timer] of timers) {
        if (timer.dueAt <= target && (!next || timer.dueAt < next.dueAt)) {
          nextHandle = handle;
          next = timer;
        }
      }

      if (!next) {
        break;
      }

      now = next.dueAt;

      if (next.repeating) {
        next.dueAt = now + next.delay;
      } else {
        timers.delete(nextHandle);
      }

      next.callback();
    }

    now = target;
  }

  return {
    setTimeout: (callback, delay) => schedule(callback, delay, false),
    clearTimeout: cancel,
    setInterval: (callback, delay) => schedule(callback, delay, true),
    clearInterval: cancel,
    now: () => now,
    advance,
    get pendingCount() {
      return timers.size;
    },
    get pendingDelays() {
      return Array.from(timers.values()).map((timer) => timer.delay);
    }
  };
}

// Records observe/disconnect and lets a test push a mutation batch by hand.
function createMutationObserverClass() {
  const instances = [];

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      instances.push(this);
    }

    observe(target, options) {
      this.targets.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }

    trigger(records = [{}]) {
      this.callback(records, this);
    }
  }

  FakeMutationObserver.instances = instances;
  FakeMutationObserver.last = () => instances[instances.length - 1];

  return FakeMutationObserver;
}

// Minimal EventTarget: enough for pagehide / pageshow / visibilitychange.
function createEventEmitter() {
  const listeners = new Map();

  return {
    addEventListener(type, listener, options) {
      const bucket = listeners.get(type) || [];
      bucket.push({ listener, once: Boolean(options?.once) });
      listeners.set(type, bucket);
    },
    removeEventListener(type, listener) {
      const bucket = listeners.get(type);

      if (!bucket) {
        return;
      }

      listeners.set(
        type,
        bucket.filter((entry) => entry.listener !== listener)
      );
    },
    dispatch(type, event = {}) {
      const bucket = listeners.get(type) || [];
      listeners.set(
        type,
        bucket.filter((entry) => !entry.once)
      );
      bucket.forEach((entry) => entry.listener({ type, ...event }));
    },
    listenerCount(type) {
      return (listeners.get(type) || []).length;
    }
  };
}

// A document stand-in for the title renderer and the visibility checks.
function createFakeDocument({ title = "Example", visibilityState = "visible" } = {}) {
  const emitter = createEventEmitter();

  return {
    title,
    visibilityState,
    documentElement: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: emitter.addEventListener,
    removeEventListener: emitter.removeEventListener,
    dispatch: emitter.dispatch,
    listenerCount: emitter.listenerCount
  };
}

module.exports = {
  createClock,
  createMutationObserverClass,
  createEventEmitter,
  createFakeDocument
};
