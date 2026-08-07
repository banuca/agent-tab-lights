(function attachCodexDetector(globalScope) {
  "use strict";

  const kit =
    globalScope.AgentTabLights?.kit ||
    (typeof require === "function" ? require("../lib/detector-kit.js") : null);

  if (!kit) {
    return;
  }

  const profile = {
    id: "codex",
    label: "Codex",
    selectors: {
      // See the note in detectors/claude-code.js: this gate is what keeps
      // unrelated VS Code webviews silent.
      identify: [
        '[data-testid*="codex" i]',
        '[class*="codex" i]',
        '[id*="codex" i]',
        'img[alt*="codex" i]',
        '[aria-label*="codex" i]',
        '[data-vscode-webview-id*="codex" i]',
        '[data-testid*="openai" i]',
        '[class*="openai" i]'
      ],
      working: [
        'button[aria-label*="stop" i]',
        'button[aria-label*="interrupt" i]',
        'button[aria-label*="cancel" i]',
        'button[data-testid*="stop" i]',
        'button[data-testid*="cancel" i]',
        '[data-state="running"]',
        '[data-state="streaming"]',
        '[data-streaming="true"]'
      ],
      busy: ['[aria-busy="true"]'],
      live: [
        '[role="status"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]',
        '[data-testid*="status" i]',
        '[data-testid*="spinner" i]',
        '[class*="spinner" i]'
      ],
      actionButtons: [
        '[role="dialog"] button',
        'button[data-testid*="approve" i]',
        'button[data-testid*="allow" i]',
        'button[data-testid*="confirm" i]',
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
      working:
        /\b(?:codex is (?:working|thinking|running)|running (?:command|tool)|working on it)\b|^(?:thinking|working|reading|searching|analysing|analyzing|generating|writing|creating|planning|editing|running|executing|applying)(?:\b|…|\.\.\.)/i,
      waiting:
        /^(?:approve|approve (?:and run|command|patch)|allow(?: once| always| command)?|always allow|accept|accept (?:patch|changes|all)|apply|apply patch|yes|yes,?\s*(?:proceed|continue|run)?|confirm|continue|run(?: anyway| command)?|retry)$/i,
      error:
        /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate|send|apply)|connection (?:lost|error)|unexpected error|internal server error|rate limit|request (?:failed|timed out)|not (?:signed in|authenticated)|authentication (?:failed|error)|api error)\b/i
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
