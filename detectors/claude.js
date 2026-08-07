(function attachClaudeDetector(globalScope) {
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
    id: "claude",
    label: "Claude",
    hosts: ["claude.ai"],
    selectors: {
      working: [
        // data-is-streaming is Claude's own marker on the streaming message
        // container and is the strongest signal available here.
        '[data-is-streaming="true"]',
        ...vocab.selectors.stopButtons,
        'button[data-testid*="stop" i]',
        ...vocab.selectors.streamingAttrs
      ],
      busy: [
        'main[aria-busy="true"]',
        'main form[aria-busy="true"]',
        '[data-testid*="chat" i][aria-busy="true"]'
      ],
      // Scoped to the transcript. Unscoped live regions also picked up the app
      // shell's global announcements and toasts, which have nothing to do with
      // whether a response is streaming.
      live: [
        'main [role="status"]',
        'main [aria-live="assertive"]',
        'main [aria-live="polite"]',
        '[data-testid*="chat" i] [role="status"]'
      ],
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: [
        'main [role="alert"]',
        'main [data-testid*="error" i]',
        '[data-testid*="error-message" i]'
      ]
    },
    text: {
      working: vocab.workingText({ agentNames: ["claude"] }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({
        extra: [
          "overloaded",
          "response was interrupted",
          "message limit reached",
          "conversation is too long"
        ]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.claude = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
