(function attachWatcher(globalScope) {
  "use strict";

  const defaultEvaluationDelayMs = 100;
  const defaultSafetyIntervalMs = 3000;

  // Narrowed so token-by-token text streaming does not fire an attribute storm.
  const watchedAttributes = Object.freeze([
    "aria-busy",
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
   */
  function createWatcher(options) {
    const onChange = options.onChange;
    const target = options.target || globalScope.document?.documentElement;
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

      coalesceTimer = globalScope.setTimeout(() => {
        coalesceTimer = null;
        onChange("mutation");
      }, evaluationDelayMs);
    }

    function stop() {
      stopped = true;

      observer?.disconnect();
      observer = null;

      if (safetyTimer !== null) {
        globalScope.clearInterval(safetyTimer);
        safetyTimer = null;
      }

      if (coalesceTimer !== null) {
        globalScope.clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
    }

    function start() {
      if (!target) {
        return;
      }

      stopped = false;

      observer = new globalScope.MutationObserver(schedule);
      observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: watchedAttributes.slice()
      });

      safetyTimer = globalScope.setInterval(
        () => onChange("interval"),
        safetyIntervalMs
      );

      globalScope.addEventListener("pagehide", stop, { once: true });

      onChange("start");
    }

    return Object.freeze({ start, stop });
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
