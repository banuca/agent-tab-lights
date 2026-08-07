(function attachWatcher(globalScope) {
  "use strict";

  const defaultEvaluationDelayMs = 100;
  const defaultSafetyIntervalMs = 3000;

  // Narrowed so token-by-token text streaming does not fire an attribute storm.
  const watchedAttributes = Object.freeze([
    "aria-busy",
    "aria-disabled",
    "aria-hidden",
    "aria-label",
    "data-testid",
    "data-is-streaming",
    "data-state",
    "data-streaming",
    "disabled",
    "hidden",
    "title"
  ]);

  /**
   * Fires `onChange` when the page might have changed state. Layered on purpose:
   * mutations catch DOM edits, the interval catches CSS-only changes the
   * observer cannot see, and both are torn down on pagehide.
   *
   * Every browser dependency is injectable so the suite can drive this without
   * a DOM; the defaults are the real globals, so callers pass nothing.
   */
  function createWatcher(options) {
    const onChange = options.onChange;
    const host = options.globalScope || globalScope;
    const target = options.target || host.document?.documentElement;
    const ObserverClass = options.MutationObserver || host.MutationObserver;
    const setTimer = options.setTimeout || host.setTimeout.bind(host);
    const clearTimer = options.clearTimeout || host.clearTimeout.bind(host);
    const setRepeating = options.setInterval || host.setInterval.bind(host);
    const clearRepeating = options.clearInterval || host.clearInterval.bind(host);
    const eventTarget = options.eventTarget || host;
    const evaluationDelayMs =
      options.evaluationDelayMs ?? defaultEvaluationDelayMs;
    const safetyIntervalMs =
      options.safetyIntervalMs ?? defaultSafetyIntervalMs;

    let observer = null;
    let safetyTimer = null;
    let coalesceTimer = null;
    let stopped = false;

    // Coalesces a burst of mutations into a single evaluation.
    function schedule() {
      if (stopped || coalesceTimer !== null) {
        return;
      }

      coalesceTimer = setTimer(() => {
        coalesceTimer = null;
        onChange("mutation");
      }, evaluationDelayMs);
    }

    function stop() {
      stopped = true;

      // Removed explicitly rather than left to {once:true}: a watcher that is
      // stopped and restarted (settings toggles, bfcache) would otherwise leave
      // a listener pinning every previous instance.
      eventTarget.removeEventListener?.("pagehide", stop);

      observer?.disconnect();
      observer = null;

      if (safetyTimer !== null) {
        clearRepeating(safetyTimer);
        safetyTimer = null;
      }

      if (coalesceTimer !== null) {
        clearTimer(coalesceTimer);
        coalesceTimer = null;
      }
    }

    function start() {
      if (!target || !ObserverClass) {
        return;
      }

      // Restarting (after a bfcache restore) must not stack observers.
      if (observer) {
        stop();
      }

      stopped = false;

      observer = new ObserverClass(schedule);
      observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: watchedAttributes.slice()
      });

      safetyTimer = setRepeating(() => onChange("interval"), safetyIntervalMs);

      eventTarget.addEventListener("pagehide", stop, { once: true });

      onChange("start");
    }

    return Object.freeze({
      start,
      stop,
      get running() {
        return observer !== null;
      }
    });
  }

  const watcher = Object.freeze({
    createWatcher,
    watchedAttributes,
    defaultEvaluationDelayMs,
    defaultSafetyIntervalMs
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.watcher = watcher;

  if (typeof module === "object" && module.exports) {
    module.exports = watcher;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
