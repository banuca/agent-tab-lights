(function attachGeminiDetector(globalScope) {
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

  /*
   * Gemini is an Angular app built from custom elements rather than landmark
   * tags, so scoping goes through <chat-window> and friends instead of <main>.
   * It also spells its test hooks data-test-id, not data-testid.
   *
   * VERIFY(capture): every selector below is unconfirmed against the live site.
   */
  const profile = {
    id: "gemini",
    label: "Gemini",
    hosts: ["gemini.google.com"],
    selectors: {
      working: [
        'button[aria-label*="stop response" i]',
        'button[aria-label*="stop generating" i]',
        'button[data-test-id*="stop" i]',
        ...vocab.selectors.stopButtons,
        ...vocab.selectors.streamingAttrs
      ],
      busy: [
        'chat-window [aria-busy="true"]',
        'main [aria-busy="true"]',
        'model-response[aria-busy="true"]'
      ],
      live: [
        'chat-window [role="status"]',
        'main [role="status"]',
        'main [aria-live="assertive"]',
        'main [aria-live="polite"]'
      ],
      // Gemini has no tool-approval flow; a modal is the only thing that can
      // legitimately be waiting on the user here.
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: [
        'chat-window [role="alert"]',
        'main [role="alert"]',
        '[class*="error-message" i]'
      ]
    },
    text: {
      working: vocab.workingText({ agentNames: ["gemini"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({
        extra: [
          "response was blocked",
          "rate limit",
          "you've reached your limit"
        ]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.gemini = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
