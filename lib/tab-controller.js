(function attachTabController(globalScope) {
  "use strict";

  // How long after a relayed report to re-check whether it has expired. Armed
  // from a message callback, so it is a nesting-0 timer and stays roughly
  // accurate even in a hidden tab - unlike the safety interval.
  const staleCheckSlackMs = 1000;

  /**
   * Owns the tab title. One pipeline, whatever the tab is:
   *
   *   local detector (this document)  ─┐
   *                                    ├─ merge ─ state machine ─ title
   *   relayed panel reports (frames)  ─┘
   *
   * The two used to be exclusive branches, which is why a workbench could only
   * ever show panel state. Merging both means a Codespace running Copilot Chat
   * in the workbench and Claude Code in a webview resolves to a single light,
   * and there is exactly one state machine per tab either way.
   */
  function createTabController(options) {
    const protocol = options.protocol;
    const doc = options.document;
    const host = options.globalScope || globalScope;
    const getDetectors = options.getDetectors || (() => ({}));
    const localDetector = options.localDetector || null;
    const now = options.now;
    const setTimer = options.setTimeout || host.setTimeout.bind(host);
    const clearTimer = options.clearTimeout || host.clearTimeout.bind(host);
    const setRepeating = options.setInterval || host.setInterval.bind(host);
    const clearRepeating = options.clearInterval || host.clearInterval.bind(host);
    const ObserverClass = options.MutationObserver || host.MutationObserver;
    const createWatcher = options.createWatcher || null;
    const runtime = options.runtime || host.chrome?.runtime || null;
    const isProviderEnabled = options.isProviderEnabled || (() => true);
    const expectsPanels = Boolean(options.expectsPanels);

    let relayReport = null;
    let mergedLabel = null;
    let mergedDetectorId = null;
    // Whether the local detector's UI is actually on the page right now, as
    // opposed to merely being the detector that claims this host.
    let localPresent = false;
    // Whether the local provider is switched on, tracked across settings
    // changes so a switch-off can be told apart from an agent going quiet.
    let localEligible = Boolean(localDetector);
    let staleTimer = null;
    let renderInterval = null;
    let titleObserver = null;
    let messageListener = null;
    let watcher = null;
    let enabled = true;
    let started = false;
    let disposed = false;

    const renderer = options.tabTitleKit.createTitleRenderer({
      document: doc,
      fallbackTitle: localDetector?.label || "Agent",
      agentName: () => agentName()
    });

    function relayIsFresh() {
      return Boolean(
        relayReport && now() - relayReport.receivedAt <= protocol.staleAfterMs
      );
    }

    function agentName() {
      const relay = relayIsFresh() ? relayReport : null;

      return (
        mergedLabel ||
        relay?.label ||
        getDetectors()[relay?.detectorId]?.label ||
        relay?.detectorId ||
        (localPresent ? localDetector?.label : null) ||
        "Agent"
      );
    }

    function detect() {
      const reports = [];

      // Relay first, so a quiet panel names the tab in preference to an idle
      // local detector: mergeStates keeps the first report of a tied rank.
      if (relayIsFresh()) {
        reports.push(relayReport);
      }

      /*
       * Two gates on the local detector, both narrow on purpose:
       *
       * - identify(), for the same reason a webview needs it. Copilot Chat
       *   shares its host with every other workbench tab, so a workbench with
       *   no chat view open must not be named after it.
       * - the per-provider setting, applied *here* rather than to the whole
       *   controller. Switching off Copilot Chat must not also blind the tab to
       *   the Claude Code panel next to it. Relayed panels are already filtered
       *   at source by the frame reporter.
       */
      localEligible = Boolean(localDetector && isProviderEnabled(localDetector.id));
      localPresent = Boolean(localEligible && localDetector.identify(doc));

      if (localPresent) {
        reports.push({
          state: localDetector.detect(doc),
          detectorId: localDetector.id,
          label: localDetector.label
        });
      }

      const merged = protocol.mergeStates(reports);
      mergedLabel = merged.label;
      mergedDetectorId = merged.detectorId;

      return merged.state;
    }

    const machine = options.stateMachineKit.createStateMachine({
      detect,
      render: (state) => renderer.render(state),
      getUrl: () => host.location?.href || "",
      setTimeout: setTimer,
      clearTimeout: clearTimer
    });

    function evaluate() {
      if (!enabled || disposed) {
        return;
      }

      machine.evaluate();
    }

    // A panel that closed stops reporting, so silence has to expire. The safety
    // interval cannot be trusted to do it: Chrome throttles interval timers in
    // a hidden tab to roughly once a minute, which is exactly when a long agent
    // run is most likely to be going. Re-arming a one-shot timer per report
    // keeps expiry accurate whether or not the tab is in front.
    function armStaleTimer() {
      if (staleTimer !== null) {
        clearTimer(staleTimer);
      }

      staleTimer = setTimer(() => {
        staleTimer = null;
        evaluate();
      }, protocol.staleAfterMs + staleCheckSlackMs);
    }

    function onMessage(message, sender, sendResponse) {
      if (message?.type === protocol.messages.tabState) {
        relayReport = {
          state: message.state,
          detectorId: message.detectorId,
          label: message.label,
          sources: message.sources || 0,
          receivedAt: now()
        };

        armStaleTimer();
        evaluate();
        return undefined;
      }

      // Answers the popup. Registered whatever the tab is, so "not active on
      // this tab" in the popup means genuinely not injected, rather than
      // injected-but-silent.
      if (message?.type === protocol.messages.getState) {
        sendResponse?.({
          ok: true,
          // The master switch, and separately whether this tab's own provider
          // is switched on - the popup needs to tell the two apart to point the
          // user at the control that is actually turning the light off.
          enabled,
          providerEnabled: localDetector ? localEligible : true,
          // Whether this tab can host agent panels at all, so the popup only
          // says "no panel detected" where a panel could exist.
          expectsPanels,
          state: machine.state,
          // Whichever source won the merge, so the popup highlights the row
          // that is actually driving the light. Falls back to the host's own
          // detector, which is what names the row to switch back on when that
          // provider is the one that has been turned off.
          detectorId: mergedDetectorId || localDetector?.id || null,
          label: enabled ? agentName() : null,
          observedWork: machine.observedWork,
          sources: relayIsFresh() ? relayReport.sources : 0
        });
      }

      return undefined;
    }

    function startWatching() {
      // Settings can resolve either side of start(), so the guard lives here
      // rather than at each call site.
      if (!createWatcher || watcher || !enabled || disposed) {
        return;
      }

      watcher = createWatcher({
        onChange: () => evaluate()
      });

      watcher.start();
    }

    function stopWatching() {
      watcher?.stop();
      watcher = null;
    }

    function start() {
      // Idempotent: resume() calls this to rebuild after a bfcache restore, and
      // starting twice would stack listeners, intervals and observers.
      if (started) {
        dispose();
      }

      started = true;
      disposed = false;

      if (runtime?.onMessage) {
        messageListener = onMessage;
        runtime.onMessage.addListener(messageListener);
      }

      startWatching();

      // Re-applies the prefix after the page rewrites its own title. render()
      // only assigns when the value differs, so observing what we write to
      // cannot loop.
      const titleElement = doc.querySelector?.("title");

      if (titleElement && ObserverClass) {
        titleObserver = new ObserverClass(() => {
          if (enabled && !disposed) {
            renderer.render(machine.state);
          }
        });

        titleObserver.observe(titleElement, {
          childList: true,
          characterData: true,
          subtree: true
        });
      }

      // Belt and braces behind the mutation and message paths.
      renderInterval = setRepeating(() => evaluate(), protocol.heartbeatMs);

      evaluate();
    }

    // The tab is being looked at again, either because it came to the front
    // (where timers were barely running) or because it was restored from the
    // back/forward cache. A restore has already run dispose() via pagehide, so
    // resuming has to rebuild rather than nudge - otherwise the tab comes back
    // with a frozen dot and no way to clear it short of a reload.
    function resume() {
      if (disposed) {
        start();
        return;
      }

      startWatching();
      evaluate();
    }

    function setEnabled(next) {
      if (next === enabled) {
        return;
      }

      enabled = next;

      if (!enabled) {
        stopWatching();
        machine.dispose();
        renderer.clear();
        return;
      }

      startWatching();
      evaluate();
    }

    /**
     * Re-reads the per-provider setting. Called after settings change, and
     * separate from setEnabled because the two switches do different things: the
     * master switch silences the whole tab, while a provider switch only removes
     * one source from the merge.
     *
     * The reset is the load-bearing part. Without it, a provider that stops
     * contributing looks exactly like an agent that finished, and the machine
     * settles to a green dot that never clears - which is precisely what the
     * user just asked to get rid of.
     */
    function refreshProviders() {
      const wasEligible = localEligible;

      localEligible = Boolean(
        localDetector && isProviderEnabled(localDetector.id)
      );

      if (localEligible !== wasEligible) {
        machine.resetForNavigation();
      }

      evaluate();
    }

    function dispose() {
      disposed = true;
      started = false;

      stopWatching();
      machine.dispose();

      if (staleTimer !== null) {
        clearTimer(staleTimer);
        staleTimer = null;
      }

      if (renderInterval !== null) {
        clearRepeating(renderInterval);
        renderInterval = null;
      }

      titleObserver?.disconnect();
      titleObserver = null;

      if (messageListener && runtime?.onMessage?.removeListener) {
        runtime.onMessage.removeListener(messageListener);
        messageListener = null;
      }
    }

    return Object.freeze({
      start,
      resume,
      dispose,
      setEnabled,
      refreshProviders,
      evaluate,
      handleMessage: onMessage,
      get state() {
        return machine.state;
      },
      get agentName() {
        return agentName();
      }
    });
  }

  const tabController = Object.freeze({ createTabController });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.tabController = tabController;

  if (typeof module === "object" && module.exports) {
    module.exports = tabController;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
