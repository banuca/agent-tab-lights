/*
 * Runs inside VS Code webview iframes (the Claude Code and Codex panels).
 *
 * This half only detects and reports. It deliberately holds no state machine
 * and never touches a title: the panel lives in a sandboxed, cross-origin
 * iframe that cannot reach the Codespaces tab title, so the top frame owns
 * presentation and the service worker relays between the two.
 */
(function startFrameReporter(globalScope) {
  "use strict";

  const namespace = globalScope.AgentTabLights;
  const protocol = namespace?.protocol;
  const watcherKit = namespace?.watcher;
  const detectors = namespace?.detectors;

  if (!protocol || !watcherKit || !detectors) {
    return;
  }

  // The top frame handles its own host directly; injecting here as well would
  // double-report and let a frame fight the local detector.
  if (globalScope === globalScope.top) {
    return;
  }

  // Provider detectors first, generic fallback last.
  const candidates = [
    detectors["claude-code"],
    detectors.codex,
    detectors["generic-agent"]
  ].filter(Boolean);

  // We are injected into every webview in the workbench, including markdown
  // previews and the settings editor. Anything that does not identify as an
  // agent panel must stay completely silent rather than report idle, so the
  // aggregator never counts it as a live source.
  const detector = candidates.find((candidate) => candidate.identify(document));

  if (!detector) {
    return;
  }

  let lastReported = null;
  let lastSentAt = 0;
  let stopped = false;

  function send(state) {
    if (stopped) {
      return;
    }

    try {
      globalScope.chrome?.runtime?.sendMessage({
        type: protocol.messages.frameState,
        state,
        detectorId: detector.id,
        label: detector.label
      });
    } catch {
      // The extension was reloaded or the context was invalidated. Stop rather
      // than throw on every subsequent mutation.
      stopped = true;
      watcher.stop();
    }
  }

  function report(reason) {
    const state = detector.detect(document);
    const now = performance.now();
    const changed = state !== lastReported;

    // Report changes immediately, and otherwise heartbeat so the top frame can
    // distinguish a quiet panel from one that has been closed.
    if (!changed && now - lastSentAt < protocol.heartbeatMs) {
      return;
    }

    lastReported = state;
    lastSentAt = now;
    send(state);
  }

  const watcher = watcherKit.createWatcher({
    onChange: report,
    safetyIntervalMs: protocol.heartbeatMs
  });

  globalScope.addEventListener(
    "pagehide",
    () => {
      watcher.stop();

      try {
        globalScope.chrome?.runtime?.sendMessage({
          type: protocol.messages.frameGone,
          detectorId: detector.id
        });
      } catch {
        // Nothing useful to do while the frame is being torn down.
      }
    },
    { once: true }
  );

  watcher.start();
})(typeof globalThis !== "undefined" ? globalThis : this);
