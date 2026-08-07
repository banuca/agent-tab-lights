(function attachCopilotChatDetector(globalScope) {
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
   * Copilot Chat is native workbench UI, not a webview, so unlike the other
   * agent panels it is detected from the top frame alongside the relayed
   * webview reports. That is why it declares hosts.
   *
   * Everything is scoped to the chat session container. The workbench top frame
   * is an enormous document full of buttons, spinners and aria-busy lists that
   * have nothing to do with an agent, so an unscoped selector here would be
   * far worse than on a single-purpose chat page.
   *
   * These selectors follow VS Code's interactive-session markup and are the
   * least verified in the repo. Check them with tools/capture-state.js against
   * a real workbench before trusting them.
   */
  const session = ".interactive-session";

  const profile = {
    id: "copilot-chat",
    label: "Copilot",
    hosts: ["*.github.dev", "vscode.dev"],
    selectors: {
      // VERIFY(capture): without the chat view open this must find nothing, or
      // the detector reports on every workbench tab.
      identify: [
        session,
        '[id*="workbench.panel.chat" i]',
        '[id*="workbench.view.chat" i]',
        '[class*="interactive-session" i]'
      ],
      // VERIFY(capture): codicon-stop-circle is the cancel affordance on the
      // in-progress response; the scoped cancel label is its accessible name.
      working: [
        `${session} .codicon-stop-circle`,
        `${session} button[aria-label*="cancel" i]`,
        `${session} button[aria-label*="stop" i]`,
        ...vocab.selectors.stopButtons,
        `${session} .chat-progress-part`
      ],
      busy: [
        `${session} [aria-busy="true"]`,
        '.interactive-response[aria-busy="true"]'
      ],
      live: [
        `${session} [role="status"]`,
        `${session} [aria-live="assertive"]`,
        `${session} [aria-live="polite"]`,
        `${session} .chat-progress-part`
      ],
      // "Continue" is Copilot's literal agent-mode approval button, which is
      // only safe to match because every selector here is scoped to a
      // confirmation widget rather than to buttons in general.
      actionButtons: [
        ".chat-confirmation-widget button",
        `${session} [class*="confirmation" i] button`,
        ...vocab.selectors.approvalButtons
      ],
      errors: [`${session} [role="alert"]`, ".chat-error-details"]
    },
    text: {
      working: vocab.workingText({
        agentNames: ["copilot"],
        extraPhrases: ["running tools", "generating edits"]
      }),
      waiting: vocab.waitingText({ extra: ["continue", "keep going"] }),
      error: vocab.errorText({
        extra: ["rate limit", "sorry, your request failed", "not signed in"]
      })
    }
  };

  const detector = kit.createDetector(profile);

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.detectors = namespace.detectors || {};
  namespace.detectors["copilot-chat"] = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
