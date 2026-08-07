(function attachMistralDetector(globalScope) {
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

  // VERIFY(capture): unconfirmed against the live site.
  const profile = {
    id: "mistral",
    label: "Le Chat",
    hosts: ["chat.mistral.ai"],
    selectors: {
      working: [
        'main button[aria-label*="stop" i]',
        'button[data-testid*="stop" i]',
        ...vocab.selectors.stopButtons,
        ...vocab.selectors.streamingAttrs
      ],
      busy: ['main [aria-busy="true"]'],
      live: [
        'main [role="status"]',
        'main [aria-live="assertive"]',
        'main [aria-live="polite"]'
      ],
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: ['main [role="alert"]', 'main [class*="error-message" i]']
    },
    text: {
      working: vocab.workingText({ agentNames: ["le chat", "mistral"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({ extra: ["rate limit", "too many requests"] })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.mistral = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
