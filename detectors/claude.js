(function attachClaudeDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);

  if (!kit) {
    return;
  }

  const profile = {
    id: "claude",
    label: "Claude",
    selectors: {
      working: [
        // data-is-streaming is Claude's own marker on the streaming message
        // container and is the strongest signal available here.
        '[data-is-streaming="true"]',
        'button[aria-label*="stop response" i]',
        'button[aria-label*="stop generating" i]',
        'button[aria-label*="stop streaming" i]',
        'button[data-testid*="stop" i]',
        '[data-testid="stop-button"]',
        'button[title*="stop response" i]'
      ],
      busy: [
        'main[aria-busy="true"]',
        'main form[aria-busy="true"]',
        '[data-testid*="chat" i][aria-busy="true"]'
      ],
      live: [
        '[role="status"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]'
      ],
      actionButtons: [
        '[role="dialog"] button',
        'button[data-testid*="approve" i]',
        'button[data-testid*="allow" i]',
        'button[data-testid*="confirm" i]',
        'main button'
      ],
      errors: [
        '[role="alert"]',
        'main [data-testid*="error" i]',
        '[data-testid*="error-message" i]'
      ]
    },
    text: {
      // Claude cycles through varied gerunds while working ("Pondering…",
      // "Researching…"), so match the shape rather than an exhaustive list.
      working:
        /\bclaude is (?:working|thinking|writing|researching|responding)\b|^(?:thinking|pondering|working|researching|reading|searching|browsing|analysing|analyzing|generating|writing|creating|planning|reasoning|deciphering|puzzling|considering|reviewing|running|executing)(?:\b|…|\.\.\.)/i,
      waiting:
        /^(?:approve|allow(?: once| always| for (?:this|all) (?:chat|chats|sites?))?|always allow|confirm|continue|grant access|keep going|reconnect|resume|retry|run(?: anyway| command| tool)?|yes,?\s*(?:continue|proceed|run)?)$/i,
      error:
        /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate|send)|connection (?:lost|error)|unexpected error|internal server error|overloaded|response was interrupted|message limit reached|conversation is too long)\b/i
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
