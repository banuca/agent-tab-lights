(function attachChatGPTDetector(globalScope) {
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

  const profile = {
    id: "chatgpt",
    label: "ChatGPT",
    hosts: ["chatgpt.com", "chat.openai.com"],
    selectors: {
      working: [
        'button[data-testid="stop-button"]',
        ...vocab.selectors.stopButtons,
        // Rendered as a div rather than a button, so the DOM `disabled`
        // property never applies - isActive falls back to aria-disabled.
        '[data-testid*="stop" i][role="button"]',
        ...vocab.selectors.streamingAttrs
      ],
      busy: [
        'main[aria-busy="true"]',
        'main form[aria-busy="true"]',
        'main [data-testid*="conversation-turn" i][aria-busy="true"]'
      ],
      live: [
        'main [role="status"]',
        'main [aria-live="assertive"]',
        'main [aria-live="polite"]'
      ],
      // No bare `main button`. ChatGPT renders Retry and "Continue generating"
      // under finished messages, and matching them made every completed
      // conversation read as waiting for input.
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: ['main [role="alert"]', 'main [data-testid*="error" i]']
    },
    text: {
      working: vocab.workingText({ agentNames: ["chatgpt"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({
        extra: ["rate limit", "too many requests", "overloaded"]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.chatgpt = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
