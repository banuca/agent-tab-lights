(function attachStateMachine(globalScope) {
  "use strict";

  const defaultCompletionDelayMs = 1200;

  // Detector output plus the synthetic `done` the machine derives once work has
  // been observed and the page has gone quiet again.
  const states = Object.freeze([
    "idle",
    "working",
    "done",
    "waiting",
    "error"
  ]);

  /**
   * Owns the provider-agnostic transitions: has work been seen in this
   * conversation, and has it been quiet long enough to call it finished.
   *
   * Timers and the clock are injected so this is testable without a browser.
   *
   * @param {object} options
   * @param {() => string} options.detect        current detector state
   * @param {(state: string) => void} options.render  called on every decision
   * @param {() => string} options.getUrl        conversation identity
   */
  function createStateMachine(options) {
    const detect = options.detect;
    const render = options.render;
    const getUrl = options.getUrl || (() => "");
    const setTimer = options.setTimeout || setTimeout;
    const clearTimer = options.clearTimeout || clearTimeout;
    const completionDelayMs =
      options.completionDelayMs ?? defaultCompletionDelayMs;

    let displayedState = "idle";
    let observedWork = false;
    let lastUrl = getUrl();
    let completionTimer = null;

    function clearCompletionTimer() {
      if (completionTimer !== null) {
        clearTimer(completionTimer);
        completionTimer = null;
      }
    }

    function sync() {
      render(displayedState);
    }

    function show(state) {
      displayedState = state;
      sync();
    }

    // The debounce that makes green trustworthy: only commit to `done` if work
    // was actually observed, we are still in the same conversation, and the
    // detector still reports idle once the delay has elapsed.
    function finishAfterStableIdle() {
      if (completionTimer !== null) {
        sync();
        return;
      }

      const urlAtStart = getUrl();

      completionTimer = setTimer(() => {
        completionTimer = null;

        if (observedWork && getUrl() === urlAtStart && detect() === "idle") {
          show("done");
        } else {
          evaluate();
        }
      }, completionDelayMs);
    }

    function resetForNavigation() {
      clearCompletionTimer();
      observedWork = false;
      lastUrl = getUrl();
      show("idle");
    }

    function evaluate() {
      if (getUrl() !== lastUrl) {
        resetForNavigation();
      }

      const detectedState = detect();

      if (detectedState === "working") {
        clearCompletionTimer();
        observedWork = true;
        show("working");
        return;
      }

      if (detectedState === "waiting") {
        clearCompletionTimer();
        observedWork = true;
        show("waiting");
        return;
      }

      if (detectedState === "error") {
        clearCompletionTimer();
        show("error");
        return;
      }

      if (
        observedWork &&
        (displayedState === "working" || displayedState === "waiting")
      ) {
        finishAfterStableIdle();
        return;
      }

      sync();
    }

    function dispose() {
      clearCompletionTimer();
    }

    return Object.freeze({
      evaluate,
      resetForNavigation,
      dispose,
      get state() {
        return displayedState;
      },
      get observedWork() {
        return observedWork;
      }
    });
  }

  const stateMachine = Object.freeze({
    createStateMachine,
    states,
    defaultCompletionDelayMs
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.stateMachine = stateMachine;

  if (typeof module === "object" && module.exports) {
    module.exports = stateMachine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
