(function attachRelayHub(globalScope) {
  "use strict";

  /*
   * The bookkeeping half of the service worker: which frames in which tab are
   * reporting what, and what the tab should therefore show.
   *
   * Split out from background.js so it can be tested without an extension
   * host. Everything it touches is injected, and nothing here refers to
   * `document` - the worker loads this file via importScripts.
   */
  function createRelayHub(options) {
    const protocol = options.protocol;
    const sendToTab = options.sendToTab;
    const now = options.now || (() => Date.now());

    // tabId -> Map<frameId, { state, detectorId, label, seenAt }>
    const tabs = new Map();

    function pruneStale(frames) {
      const cutoff = now() - protocol.staleAfterMs;

      for (const [frameId, report] of frames) {
        if (report.seenAt < cutoff) {
          frames.delete(frameId);
        }
      }
    }

    function publish(tabId) {
      const frames = tabs.get(tabId);

      if (!frames) {
        return;
      }

      pruneStale(frames);

      if (frames.size === 0) {
        tabs.delete(tabId);
      }

      const merged = protocol.mergeStates(Array.from(frames.values()));

      sendToTab(tabId, {
        type: protocol.messages.tabState,
        state: merged.state,
        detectorId: merged.detectorId,
        label: merged.label,
        sources: frames.size
      });
    }

    /**
     * Handles one frame message. Returns true if it was ours, so the caller can
     * leave unrelated messages alone.
     */
    function handleMessage(message, sender) {
      const tabId = sender?.tab?.id;
      const frameId = sender?.frameId;

      if (typeof tabId !== "number" || typeof frameId !== "number") {
        return false;
      }

      if (message?.type === protocol.messages.frameState) {
        const frames = tabs.get(tabId) || new Map();

        frames.set(frameId, {
          state: message.state,
          detectorId: message.detectorId,
          label: message.label,
          seenAt: now()
        });

        tabs.set(tabId, frames);
        publish(tabId);
        return true;
      }

      if (message?.type === protocol.messages.frameGone) {
        const frames = tabs.get(tabId);

        if (frames?.delete(frameId)) {
          publish(tabId);
        }

        return true;
      }

      return false;
    }

    function forgetTab(tabId) {
      tabs.delete(tabId);
    }

    return Object.freeze({
      handleMessage,
      forgetTab,
      publish,
      frameCount(tabId) {
        return tabs.get(tabId)?.size || 0;
      },
      get tabCount() {
        return tabs.size;
      }
    });
  }

  const relayHub = Object.freeze({ createRelayHub });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.relayHub = relayHub;

  if (typeof module === "object" && module.exports) {
    module.exports = relayHub;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
