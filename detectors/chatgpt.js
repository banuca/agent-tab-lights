(function attachChatGPTDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);

  if (!kit) {
    return;
  }

  const profile = {
    id: "chatgpt",
    label: "ChatGPT",
    selectors: {
      working: [
        'button[data-testid="stop-button"]',
        '[data-testid="stop-button"]',
        'button[aria-label*="stop generating" i]',
        'button[aria-label*="stop response" i]',
        'button[aria-label*="stop streaming" i]',
        'button[title*="stop generating" i]',
        '[data-testid*="stop" i][role="button"]'
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
      actionButtons: [
        '[role="dialog"] button',
        'main button[data-testid*="approve" i]',
        'main button[data-testid*="allow" i]',
        'main button[data-testid*="confirm" i]',
        "main button"
      ],
      errors: ['main [role="alert"]', 'main [data-testid*="error" i]']
    },
    text: {
      working:
        /\bchatgpt is (?:working|thinking|generating)\b|^(?:working|thinking|running|searching|browsing|analysing|analyzing|generating|writing|reading|creating)(?:\b|…|\.\.\.)/i,
      waiting:
        /^(?:approve|allow(?: once| for (?:this|all) sites?)?|confirm|continue(?: generating)?|grant access|reconnect|retry|run anyway|yes,?\s*continue)$/i,
      error:
        /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate)|connection lost|unexpected error)\b/i
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
