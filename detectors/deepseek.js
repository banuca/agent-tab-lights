(function attachDeepSeekDetector(globalScope) {
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
   * The riskiest profile in the repo: DeepSeek ships hashed utility classes and
   * few test hooks, so there is little stable structure to hold onto and the
   * accessible names are the only durable handle. Kept deliberately narrow -
   * missing a light is the acceptable failure here, a permanently wrong one is
   * not.
   *
   * VERIFY(capture): unconfirmed against the live site.
   */
  const profile = {
    id: "deepseek",
    label: "DeepSeek",
    hosts: ["chat.deepseek.com"],
    selectors: {
      working: [
        'button[aria-label*="stop" i]',
        // Controls are frequently divs rather than buttons here, so the DOM
        // disabled property never applies; isActive falls back to aria.
        '[role="button"][aria-label*="stop" i]',
        ...vocab.selectors.stopButtons,
        ...vocab.selectors.streamingAttrs
      ],
      busy: ['main [aria-busy="true"]', '[role="log"][aria-busy="true"]'],
      live: [
        '[role="status"]',
        'main [aria-live="assertive"]',
        'main [aria-live="polite"]'
      ],
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: ['[role="alert"]', '[class*="error-message" i]']
    },
    text: {
      working: vocab.workingText({ agentNames: ["deepseek"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({
        extra: [
          "server is busy",
          "rate limit",
          "you have sent too many messages"
        ]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.deepseek = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
