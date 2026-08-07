(function attachClaudeCodeDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);

  if (!kit) {
    return;
  }

  // This runs inside the extension's webview iframe, where the panel is the
  // entire document. Nothing is scoped to `main` the way it is on chatgpt.com.
  const profile = {
    id: "claude-code",
    label: "Claude Code",
    selectors: {
      // Without this gate every other VS Code webview would run the full
      // detector and could report a state. Verify these against a real capture
      // (tools/capture-state.js) before trusting them.
      identify: [
        '[data-testid*="claude" i]',
        '[class*="claude" i]',
        '[id*="claude" i]',
        'img[alt*="claude" i]',
        '[aria-label*="claude" i]',
        '[data-vscode-webview-id*="claude" i]'
      ],
      working: [
        'button[aria-label*="stop" i]',
        'button[aria-label*="interrupt" i]',
        'button[aria-label*="cancel" i]',
        'button[data-testid*="stop" i]',
        'button[data-testid*="interrupt" i]',
        '[data-testid*="stop-button" i]',
        '[data-streaming="true"]',
        '[data-is-streaming="true"]',
        '[data-state="streaming"]',
        '[data-state="running"]'
      ],
      busy: [
        '[aria-busy="true"]',
        '[data-testid*="message" i][aria-busy="true"]'
      ],
      live: [
        '[role="status"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]',
        '[data-testid*="status" i]',
        '[data-testid*="spinner" i]',
        '[class*="spinner" i]',
        '[class*="thinking" i]'
      ],
      actionButtons: [
        '[role="dialog"] button',
        'button[data-testid*="approve" i]',
        'button[data-testid*="allow" i]',
        'button[data-testid*="permission" i]',
        'button[data-testid*="confirm" i]',
        'button[data-testid*="accept" i]',
        '[class*="permission" i] button',
        '[class*="approval" i] button',
        "button"
      ],
      errors: [
        '[role="alert"]',
        '[data-testid*="error" i]',
        '[class*="error-message" i]'
      ]
    },
    text: {
      // "esc to interrupt" is Claude Code's own hint that a turn is in flight,
      // which makes it a reliable working signal in both panel and CLI styling.
      working:
        /\b(?:esc to interrupt|claude is (?:working|thinking|writing|running)|running (?:tool|command)|tool (?:running|in progress))\b|^(?:thinking|pondering|working|researching|reading|searching|analysing|analyzing|generating|writing|creating|planning|reasoning|editing|running|executing|compacting)(?:\b|…|\.\.\.)/i,
      waiting:
        /^(?:approve|approve(?: plan| and run| edits?)?|accept|accept (?:plan|edits?|all)|allow(?: once| always| all(?: edits?)?)?|always allow|yes|yes,?\s*(?:allow all|and don'?t ask again|proceed|continue|run)?|confirm|continue|keep planning|run(?: anyway| command| tool)?|retry|resume)$/i,
      error:
        /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate|send|apply)|connection (?:lost|error)|unexpected error|internal server error|overloaded|request (?:failed|timed out)|not authenticated|authentication (?:failed|error)|session expired|api error)\b/i
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors["claude-code"] = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
