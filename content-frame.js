/*
 * Runs inside VS Code webview iframes (the Claude Code, Codex and other agent
 * panels). Thin wiring only - the logic lives in lib/frame-reporter.js so it
 * can be tested without an extension host.
 */
(function startFrameReporter(globalScope) {
  "use strict";

  const namespace = globalScope.AgentTabLights;
  const protocol = namespace?.protocol;
  const watcherKit = namespace?.watcher;
  const reporterKit = namespace?.frameReporter;
  const settingsKit = namespace?.settings;
  const detectors = namespace?.detectors;

  if (!protocol || !watcherKit || !reporterKit || !detectors) {
    return;
  }

  // The top frame handles its own host directly; injecting here as well would
  // double-report and let a frame fight the local detector.
  if (globalScope === globalScope.top) {
    return;
  }

  /*
   * Callback form rather than the promise form on purpose. The service worker
   * never calls sendResponse, so the promise rejects with "the message port
   * closed before a response was received" on every single heartbeat - an
   * unhandled rejection that also defeated the try/catch below, since that only
   * ever sees synchronous throws.
   *
   * Returning false means "this context is gone for good": either the extension
   * was reloaded (runtime.id disappears, or sendMessage throws) or it was
   * uninstalled. A delivery failure reported through lastError is a different
   * thing entirely - transient, and the next heartbeat retries.
   */
  function trySend(payload) {
    const runtime = globalScope.chrome?.runtime;

    if (!runtime?.id) {
      return false;
    }

    try {
      runtime.sendMessage(payload, () => {
        void runtime.lastError;
      });
      return true;
    } catch {
      return false;
    }
  }

  // Provider detectors first, generic fallback last. Copilot Chat is absent on
  // purpose: it is native workbench UI in the top frame, not a webview, so the
  // top frame detects it directly.
  const candidates = [
    detectors["claude-code"],
    detectors.codex,
    detectors["generic-agent"]
  ].filter(Boolean);

  let settings = settingsKit?.defaults;

  const reporter = reporterKit.createFrameReporter({
    candidates,
    document,
    send: trySend,
    now: () => performance.now(),
    createWatcher: watcherKit.createWatcher,
    heartbeatMs: protocol.heartbeatMs,
    minResendMs: protocol.heartbeatSlackMs,
    messages: protocol.messages,
    isEnabled: (detectorId) =>
      settingsKit ? settingsKit.isEnabled(settings, detectorId) : true
  });

  settingsKit?.load((loaded) => {
    settings = loaded;
    reporter.setEnabled(settingsKit.isEnabled(settings, reporter.detectorId));
  });

  settingsKit?.subscribe((loaded) => {
    settings = loaded;
    reporter.setEnabled(settingsKit.isEnabled(settings, reporter.detectorId));
  });

  globalScope.addEventListener("pagehide", () => reporter.teardown());

  // Restored from the back/forward cache. pagehide already withdrew this frame,
  // so it has to re-announce itself or the panel stays dark until it is closed
  // and reopened.
  globalScope.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      reporter.restart();
    }
  });

  // A hidden tab throttles timers to roughly once a minute, so what a returning
  // user sees first could be a minute stale. Refresh on the way back in.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reporter.resume();
    }
  });

  reporter.start();
})(typeof globalThis !== "undefined" ? globalThis : this);
