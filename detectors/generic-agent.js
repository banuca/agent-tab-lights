(function attachGenericAgentDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);

  if (!kit) {
    return;
  }

  // Last-resort fallback for an agent panel whose markup we have not pinned
  // down, or that changed under us. It is deliberately narrower than the
  // provider detectors: it runs in webviews we have not identified, so a false
  // positive here means a random VS Code panel turns the tab orange. When in
  // doubt this returns idle and the provider detectors do the real work.
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
        'button[aria-label*="stop generating" i]',
        'button[aria-label*="stop response" i]',
        'button[aria-label*="stop streaming" i]',
        'button[aria-label*="interrupt" i]',
        '[data-testid*="stop-button" i]',
        '[data-state="streaming"]',
        '[data-streaming="true"]',
        '[data-is-streaming="true"]'
      ],
      busy: ['[aria-busy="true"]'],
      live: ['[role="status"]', '[aria-live="assertive"]'],
      // No bare `button` here on purpose. Without knowing the provider we
      // cannot tell an approval prompt from an ordinary toolbar control, so we
      // only trust explicitly marked-up prompts.
      actionButtons: [
        '[role="dialog"] button',
        '[role="alertdialog"] button',
        'button[data-testid*="approve" i]',
        'button[data-testid*="allow" i]',
        'button[data-testid*="permission" i]'
      ],
      errors: ['[role="alert"]']
    },
    text: {
      working:
        /\b(?:esc to interrupt|is (?:working|thinking|generating|responding))\b|^(?:thinking|working|generating|running|executing|searching|analysing|analyzing)(?:\b|…|\.\.\.)/i,
      waiting:
        /^(?:approve|allow(?: once| always)?|always allow|accept|confirm|yes|yes,?\s*(?:continue|proceed|run)?|run(?: anyway| command)?)$/i,
      error:
        /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate|send)|connection (?:lost|error)|unexpected error|internal server error|request (?:failed|timed out))\b/i
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
