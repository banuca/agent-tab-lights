/*
 * Runs in the top frame and owns the tab title.
 *
 * Two modes:
 *
 *   local  - chatgpt.com and claude.ai: the agent UI is in this document, so we
 *            detect and render here, exactly as v0.1.x did.
 *   relay  - Codespaces: the agent UI is in a sandboxed webview iframe we cannot
 *            read from here, so state arrives from the service worker and this
 *            script only renders it.
 *
 * The state machine lives here in both modes, so there is exactly one per tab
 * and `observedWork` / the completion debounce behave identically either way.
 */
(function startTabLights(globalScope) {
  "use strict";

  const namespace = globalScope.AgentTabLights;
  const protocol = namespace?.protocol;
  const tabTitleKit = namespace?.tabTitle;
  const stateMachineKit = namespace?.stateMachine;

  if (!protocol || !tabTitleKit || !stateMachineKit) {
    return;
  }

  if (globalScope !== globalScope.top) {
    return;
  }

  const detectors = namespace.detectors || {};

  const localDetectorsByHost = {
    "chatgpt.com": "chatgpt",
    "chat.openai.com": "chatgpt",
    "claude.ai": "claude"
  };

  const hostname = globalScope.location.hostname.replace(/^www\./, "");
  const localDetector = detectors[localDetectorsByHost[hostname]] || null;

  // Relay mode. Note this must not bail out the way v0.1.x did when no detector
  // was present: in Codespaces having no local detector is the normal case.
  let relayReport = null;

  let agentName = localDetector?.label || "Agent";

  const renderer = tabTitleKit.createTitleRenderer({
    document,
    fallbackTitle: localDetector?.label || "Agent",
    agentName: () => agentName
  });

  function detect() {
    if (localDetector) {
      return localDetector.detect(document);
    }

    if (!relayReport) {
      return "idle";
    }

    // A panel that was closed stops reporting. Treat silence as idle rather
    // than freezing on whatever it last said.
    if (performance.now() - relayReport.receivedAt > protocol.staleAfterMs) {
      return "idle";
    }

    return relayReport.state;
  }

  function render(state) {
    renderer.render(state);
  }

  const machine = stateMachineKit.createStateMachine({
    detect,
    render,
    getUrl: () => globalScope.location.href
  });

  if (localDetector) {
    const watcher = namespace.watcher.createWatcher({
      onChange: () => machine.evaluate()
    });

    watcher.start();
  } else {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== protocol.messages.tabState) {
        return;
      }

      relayReport = {
        state: message.state,
        receivedAt: performance.now()
      };

      if (message.label || message.detectorId) {
        agentName =
          message.label ||
          detectors[message.detectorId]?.label ||
          message.detectorId;
      }

      machine.evaluate();
    });

    // Expires stale reports, drives the completion debounce, and re-applies the
    // prefix after the workbench rewrites its own title.
    globalScope.setInterval(() => machine.evaluate(), protocol.heartbeatMs);

    // The workbench rewrites document.title often (dirty editors, active file).
    // Re-sync immediately rather than waiting for the next interval tick.
    const titleElement = document.querySelector("title");

    if (titleElement) {
      // render() only assigns when the value actually differs, so observing the
      // element we write to cannot loop.
      new MutationObserver(() => render(machine.state)).observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    globalScope.addEventListener("pagehide", () => machine.dispose(), {
      once: true
    });
  }

  machine.evaluate();
})(typeof globalThis !== "undefined" ? globalThis : this);
