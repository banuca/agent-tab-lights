/*
 * Service worker: relays webview frame reports to the tab's top frame.
 *
 * Needed because a VS Code panel lives in a sandboxed, cross-origin iframe that
 * cannot reach the top-level document.title. The worker is also the natural
 * place to merge several panels in one tab.
 *
 * Holds no durable state on purpose. Chrome idles the worker aggressively, and
 * frames re-report every few seconds, so a restart heals itself.
 */
"use strict";

importScripts("lib/protocol.js");

const protocol = self.AgentTabLights.protocol;

// tabId -> Map<frameId, { state, detectorId, label, seenAt }>
const tabs = new Map();

function pruneStale(frames) {
  const cutoff = Date.now() - protocol.staleAfterMs;

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

  chrome.tabs
    .sendMessage(
      tabId,
      {
        type: protocol.messages.tabState,
        state: merged.state,
        detectorId: merged.detectorId,
        label: merged.label,
        sources: frames.size
      },
      { frameId: 0 }
    )
    .catch(() => {
      // The top frame has no listener yet, or the tab is gone. Frames keep
      // heartbeating, so the next report retries this anyway.
    });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;

  if (typeof tabId !== "number" || typeof frameId !== "number") {
    return;
  }

  if (message?.type === protocol.messages.frameState) {
    const frames = tabs.get(tabId) || new Map();

    frames.set(frameId, {
      state: message.state,
      detectorId: message.detectorId,
      label: message.label,
      seenAt: Date.now()
    });

    tabs.set(tabId, frames);
    publish(tabId);
    return;
  }

  if (message?.type === protocol.messages.frameGone) {
    const frames = tabs.get(tabId);

    if (frames?.delete(frameId)) {
      publish(tabId);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
});

// A top-level navigation replaces every frame in the tab, so drop the old
// reports rather than letting them linger until they expire.
//
// Only `status` is usable here: without the "tabs" permission Chrome strips
// changeInfo.url, so gating on it would mean this never ran.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabs.delete(tabId);
  }
});
