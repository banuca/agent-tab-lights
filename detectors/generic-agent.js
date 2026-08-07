(function attachGenericAgentDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);
  const vocab =
    globalScope.AgentTabLights?.vocab ||
    (typeof require === "function" ? require("../lib/vocab.js") : null);

  if (!kit || !vocab) {
    return;
  }

  // Last-resort fallback for an agent panel whose markup we have not pinned
  // down, or that changed under us. It runs in webviews we have not identified,
  // so a false positive here means a random VS Code panel turns the tab orange.
  // When in doubt this returns idle and the provider detectors do the real work.
  const profile = {
    id: "generic-agent",
    label: "Agent",
    selectors: {
      // Requires evidence of an actual chat surface: a composer plus a
      // transcript. A markdown preview or the settings editor has neither.
      identify: [
        '[role="log"]',
        '[role="feed"]',
        '[data-testid*="chat" i]',
        '[class*="chat-container" i]',
        '[class*="message-list" i]',
        '[class*="composer" i]'
      ],
      working: [
        ...vocab.selectors.stopButtons,
        ...vocab.selectors.streamingAttrs
      ],
      busy: [
        '[role="log"][aria-busy="true"]',
        '[data-testid*="chat" i] [aria-busy="true"]'
      ],
      live: ['[role="status"]', '[aria-live="assertive"]'],
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: ['[role="alert"]']
    },
    text: {
      working: vocab.workingText({ extraPhrases: ["esc to interrupt"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText()
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors["generic-agent"] = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
