(function attachCodexDetector(globalScope) {
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
    id: "codex",
    label: "Codex",
    selectors: {
      // See the note in detectors/claude-code.js: this gate is what keeps
      // unrelated VS Code webviews silent. Deliberately no [class*="openai"]:
      // a styling class is far too easy to hit by accident, and claiming a
      // webview here stops the generic fallback from ever seeing it.
      identify: [
        '[data-testid*="codex" i]',
        '[class*="codex" i]',
        '[id*="codex" i]',
        'img[alt*="codex" i]',
        '[aria-label*="codex" i]',
        '[data-vscode-webview-id*="codex" i]',
        '[data-testid*="openai" i]',
        '[aria-label*="openai" i]'
      ],
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
        '[class*="spinner" i]'
      ],
      actionButtons: [...vocab.selectors.approvalButtons],
      errors: [
        '[role="alert"]',
        '[data-testid*="error" i]',
        '[class*="error-message" i]'
      ]
    },
    text: {
      working: vocab.workingText({
        agentNames: ["codex"],
        extraVerbs: ["applying"]
      }),
      waiting: vocab.waitingText({ extra: ["apply patch", "approve patch"] }),
      error: vocab.errorText({
        extra: [
          "rate limit",
          "not signed in",
          "not authenticated",
          "authentication failed"
        ],
        extraFailedToVerbs: ["apply"]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors.codex = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
