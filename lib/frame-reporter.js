(function attachFrameReporter(globalScope) {
  "use strict";

  // How often to retry identification while a webview is still booting.
  const defaultIdentifyRetryMs = 1000;

  // How long to keep trying before concluding this webview is not an agent
  // panel. Panels bootstrap in seconds; this is far beyond any real boot, and
  // a panel that is reopened gets a fresh webview and a fresh script anyway.
  const defaultIdentifyGiveUpMs = 600000;

  /**
   * Detects agent state inside one VS Code webview and reports it upward.
   *
   * Holds no state machine and never touches a title: the panel lives in a
   * sandboxed, cross-origin iframe that cannot reach the Codespaces tab title,
   * so the top frame owns presentation and the service worker relays.
   *
   * The identification loop is the important part. `document_idle` in a webview
   * fires when the shell is ready, which is typically *before* the panel's app
   * has rendered anything to match against. Identifying once at that moment and
   * giving up silently meant a panel could be dead for the life of the frame,
   * with no retry and nothing logged. So the watcher starts unconditionally and
   * identification is simply the first job it drives.
   */
  function createFrameReporter(options) {
    const candidates = (options.candidates || []).filter(Boolean);
    const doc = options.document;
    const send = options.send;
    const now = options.now;
    const createWatcher = options.createWatcher;
    const heartbeatMs = options.heartbeatMs;
    const minResendMs = options.minResendMs ?? heartbeatMs;
    const identifyRetryMs = options.identifyRetryMs ?? defaultIdentifyRetryMs;
    const identifyGiveUpMs = options.identifyGiveUpMs ?? defaultIdentifyGiveUpMs;

    let detector = null;
    let enabled = options.isEnabled ? options.isEnabled(null) : true;
    let stopped = false;
    let lastReported = null;
    let lastSentAt = 0;
    let lastIdentifyAt = -Infinity;
    let startedAt = 0;
    // Set only when the extension context is gone for good, which is the one
    // reason never to try again. A pagehide teardown is recoverable.
    let orphaned = false;

    let watcher = null;

    function stop() {
      stopped = true;
      watcher?.stop();
    }

    function emit(type, state) {
      const delivered = send({
        type,
        state,
        detectorId: detector.id,
        label: detector.label
      });

      // A false here means the extension context is gone for good - the page
      // outlived a reload or uninstall. Transient delivery failures are not
      // fatal and must not silence the panel; the next heartbeat retries.
      if (!delivered) {
        orphaned = true;
        stop();
      }

      return delivered;
    }

    function report(reason) {
      const state = detector.detect(doc);
      const at = now();
      const changed = state !== lastReported;

      // Report changes immediately, and otherwise heartbeat so the top frame
      // can distinguish a quiet panel from one that has been closed. The
      // threshold sits just under the heartbeat because the safety interval
      // lands a hair early and would otherwise skip every other send.
      if (!changed && reason !== "resume" && at - lastSentAt < minResendMs) {
        return;
      }

      lastReported = state;
      lastSentAt = at;
      emit(options.messages.frameState, state);
    }

    // We are injected into every webview in the workbench, including markdown
    // previews and the settings editor. Anything that does not identify as an
    // agent panel must stay completely silent rather than report idle, so the
    // aggregator never counts it as a live source.
    function tryIdentify() {
      const at = now();

      if (at - lastIdentifyAt < identifyRetryMs) {
        return false;
      }

      lastIdentifyAt = at;

      const found = candidates.find((candidate) => candidate.identify(doc));

      if (!found) {
        if (at - startedAt > identifyGiveUpMs) {
          stop();
        }

        return false;
      }

      detector = found;

      if (options.isEnabled) {
        enabled = options.isEnabled(detector.id);
      }

      return true;
    }

    function onChange(reason) {
      if (stopped) {
        return;
      }

      if (!detector && !tryIdentify()) {
        return;
      }

      if (!enabled) {
        return;
      }

      report(reason);
    }

    function start() {
      if (orphaned) {
        return;
      }

      // Idempotent: restart() calls this after a bfcache restore, and starting
      // twice would leave two watchers reporting the same panel.
      watcher?.stop();

      startedAt = now();
      stopped = false;

      watcher = createWatcher({
        onChange,
        safetyIntervalMs: heartbeatMs
      });

      watcher.start();
    }

    // Restored from the back/forward cache. pagehide already tore this down and
    // withdrew the frame, so there is nothing to nudge - it has to be rebuilt,
    // including re-identifying, since the panel may have re-rendered.
    function restart() {
      detector = null;
      lastReported = null;
      lastSentAt = 0;
      lastIdentifyAt = -Infinity;

      start();
    }

    // Called when the tab becomes visible again. Timers in a hidden tab are
    // throttled hard, so the first thing a user looks at may be showing state
    // from a minute ago; force a fresh report rather than waiting for the next
    // throttled tick.
    function resume() {
      if (stopped) {
        return;
      }

      lastSentAt = 0;
      onChange("resume");
    }

    // The frame is going away for good. Telling the hub explicitly is what lets
    // the tab clear immediately instead of waiting out the staleness window.
    function teardown() {
      watcher?.stop();

      // Never identified, so nothing upstream knows this frame exists.
      if (!detector || stopped) {
        stopped = true;
        return;
      }

      stopped = true;
      send({ type: options.messages.frameGone, detectorId: detector.id });
    }

    function setEnabled(next) {
      if (next === enabled) {
        return;
      }

      enabled = next;

      if (!detector || stopped) {
        return;
      }

      if (enabled) {
        lastReported = null;
        lastSentAt = 0;
        onChange("settings");
        return;
      }

      // Withdraw rather than go quiet: a silent panel would linger on the tab
      // until the staleness window expired.
      lastReported = null;
      send({ type: options.messages.frameGone, detectorId: detector.id });
    }

    return Object.freeze({
      start,
      restart,
      stop,
      resume,
      teardown,
      setEnabled,
      get detectorId() {
        return detector?.id || null;
      },
      get identified() {
        return detector !== null;
      },
      get stopped() {
        return stopped;
      }
    });
  }

  const frameReporter = Object.freeze({
    createFrameReporter,
    defaultIdentifyRetryMs,
    defaultIdentifyGiveUpMs
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.frameReporter = frameReporter;

  if (typeof module === "object" && module.exports) {
    module.exports = frameReporter;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
