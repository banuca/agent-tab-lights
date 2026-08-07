(function attachClaudeCodeDetector(globalScope) {
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
      // No bare aria-label*="cancel"/"stop": in a panel that also renders
      // dialogs and forms, an ordinary Cancel button would pin the tab orange
      // for as long as the dialog stayed open.
      working: [
        ...vocab.selectors.stopButtons,
        'button[data-testid*="interrupt" i]',
        ...vocab.selectors.streamingAttrs
      ],
      busy: [
        '[data-testid*="message" i][aria-busy="true"]',
        '[class*="chat" i] [aria-busy="true"]',
        '[role="log"][aria-busy="true"]'
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
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: [
        '[role="alert"]',
        '[data-testid*="error" i]',
        '[class*="error-message" i]'
      ]
    },
    text: {
      // "esc to interrupt" is Claude Code's own hint that a turn is in flight,
      // which makes it a reliable working signal in both panel and CLI styling.
      working: vocab.workingText({
        agentNames: ["claude"],
        extraVerbs: ["compacting"],
        extraPhrases: ["esc to interrupt"]
      }),
      waiting: vocab.waitingText({ extra: ["keep planning"] }),
      error: vocab.errorText({
        extra: [
          "overloaded",
          "not authenticated",
          "authentication failed",
          "session expired"
        ],
        extraFailedToVerbs: ["apply"]
      })
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
