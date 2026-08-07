(function attachPerplexityDetector(globalScope) {
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
   * Perplexity narrates its own progress ("Searching", "Reading sources"),
   * which maps straight onto the live-region path. The long-running Research
   * and Labs modes are the ones worth getting right - a quick answer finishes
   * before a tab light is any use.
   *
   * VERIFY(capture): unconfirmed against the live site. Stop controls are
   * main-scoped because the page also carries media controls.
   */
  const profile = {
    id: "perplexity",
    label: "Perplexity",
    hosts: ["*.perplexity.ai"],
    selectors: {
      working: [
        'main button[aria-label*="stop" i]',
        'main button[data-testid*="stop" i]',
        'button[aria-label*="stop generating" i]',
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
      working: vocab.workingText({
        agentNames: ["perplexity"],
        extraPhrases: ["reading sources", "searching sources", "running steps"]
      }),
      waiting: vocab.waitingText(),
      error: vocab.errorText({
        extra: ["rate limit", "too many requests", "search failed"]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.perplexity = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
