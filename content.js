(function startAgentTabLights() {
  "use strict";

  const detector = globalThis.AgentTabLights?.chatgpt;

  if (!detector) {
    return;
  }

  const completionDelayMs = 1200;
  const evaluationDelayMs = 100;
  const titlePrefix = /^(?:🟠|🟢|🟡|🔴)\s+/u;

  const visualStates = Object.freeze({
    idle: Object.freeze({
      prefix: "",
      label: "ChatGPT idle"
    }),
    working: Object.freeze({
      prefix: "🟠 ",
      label: "ChatGPT is working"
    }),
    done: Object.freeze({
      prefix: "🟢 ",
      label: "ChatGPT has finished"
    }),
    waiting: Object.freeze({
      prefix: "🟡 ",
      label: "ChatGPT needs your input"
    }),
    error: Object.freeze({
      prefix: "🔴 ",
      label: "ChatGPT encountered an error"
    })
  });

  let displayedState = "idle";
  let observedWork = false;
  let lastUrl = window.location.href;
  let completionTimer = null;
  let evaluationTimer = null;

  function clearCompletionTimer() {
    if (completionTimer !== null) {
      window.clearTimeout(completionTimer);
      completionTimer = null;
    }
  }

  function cleanTitle() {
    return document.title.replace(titlePrefix, "").trim() || "ChatGPT";
  }

  function syncTitle(visual) {
    const desiredTitle = `${visual.prefix}${cleanTitle()}`;

    if (document.title !== desiredTitle) {
      document.title = desiredTitle;
    }
  }

  function syncVisuals() {
    const visual = visualStates[displayedState];
    syncTitle(visual);
    document.documentElement.dataset.agentTabLightsState = displayedState;
    document.documentElement.dataset.agentTabLightsLabel = visual.label;
  }

  function show(state) {
    displayedState = state;
    syncVisuals();
  }

  function finishAfterStableIdle() {
    if (completionTimer !== null) {
      syncVisuals();
      return;
    }

    const urlAtStart = window.location.href;

    completionTimer = window.setTimeout(() => {
      completionTimer = null;

      if (
        observedWork &&
        window.location.href === urlAtStart &&
        detector.detect(document) === "idle"
      ) {
        show("done");
      } else {
        evaluate();
      }
    }, completionDelayMs);
  }

  function resetForNavigation() {
    clearCompletionTimer();
    observedWork = false;
    lastUrl = window.location.href;
    show("idle");
  }

  function evaluate() {
    if (window.location.href !== lastUrl) {
      resetForNavigation();
    }

    const detectedState = detector.detect(document);

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

    syncVisuals();
  }

  function scheduleEvaluation() {
    if (evaluationTimer !== null) {
      return;
    }

    evaluationTimer = window.setTimeout(() => {
      evaluationTimer = null;
      evaluate();
    }, evaluationDelayMs);
  }

  const observer = new MutationObserver(scheduleEvaluation);

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "aria-busy",
      "aria-hidden",
      "aria-label",
      "data-testid",
      "disabled",
      "hidden",
      "title"
    ]
  });

  const safetyCheck = window.setInterval(evaluate, 3000);

  window.addEventListener(
    "pagehide",
    () => {
      observer.disconnect();
      window.clearInterval(safetyCheck);
      clearCompletionTimer();

      if (evaluationTimer !== null) {
        window.clearTimeout(evaluationTimer);
      }
    },
    { once: true }
  );

  evaluate();
})();
