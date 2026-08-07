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

    /*
     * The debounce that makes green trustworthy: only commit once the detector
     * has held idle for the delay and we are still in the same conversation.
     *
     * Where it settles depends on what we were showing when it was armed:
     *
     *   working -> done   if work was observed (the normal finish)
     *   waiting -> idle   an approval prompt that went away without any work
     *   error   -> idle   the banner cleared; never green, because nothing
     *                     finished successfully even if work happened earlier
     *
     * That last edge is why this exists at all. Red used to be terminal: an
     * error stuck until the user navigated away.
     */
    function settleAfterStableIdle() {
      if (completionTimer !== null) {
        sync();
        return;
      }

      const urlAtStart = getUrl();
      const stateAtStart = displayedState;

      completionTimer = setTimer(() => {
        completionTimer = null;

        if (getUrl() !== urlAtStart || detect() !== "idle") {
          evaluate();
          return;
        }

        show(observedWork && stateAtStart !== "error" ? "done" : "idle");
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

      // Deliberately does not set observedWork. Approval-shaped controls are
      // the easiest thing for a detector to over-match, and treating a false
      // yellow as evidence of work turned it into a false green a second later.
      // A real approval always has a working phase either side of it to set the
      // flag honestly.
      if (detectedState === "waiting") {
        clearCompletionTimer();
        show("waiting");
        return;
      }

      // observedWork survives an error on purpose: hitting Retry resumes the
      // same run, and the working -> done flow should pick up where it was.
      if (detectedState === "error") {
        clearCompletionTimer();
        show("error");
        return;
      }

      if (
        displayedState === "working" ||
        displayedState === "waiting" ||
        displayedState === "error"
      ) {
        settleAfterStableIdle();
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
