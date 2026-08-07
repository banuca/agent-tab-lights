/*
 * Service worker: relays webview frame reports to the tab's top frame.
 *
 * Needed because a VS Code panel lives in a sandboxed, cross-origin iframe that
 * cannot reach the top-level document.title. The worker is also the natural
 * place to merge several panels in one tab.
 *
 * Holds no durable state on purpose. Chrome idles the worker aggressively, and
 * frames re-report every few seconds, so a restart heals itself.
 *
 * The bookkeeping lives in lib/relay-hub.js; this file is only the wiring.
 */
"use strict";

importScripts("lib/protocol.js", "lib/relay-hub.js");

const protocol = self.AgentTabLights.protocol;

const hub = self.AgentTabLights.relayHub.createRelayHub({
  protocol,
  sendToTab(tabId, message) {
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }).catch((error) => {
      const reason = String(error?.message || error);

      // Expected and frequent: the top frame has not registered its listener
      // yet, or the tab is gone. Frames keep heartbeating, so the next report
      // retries. Anything else is worth surfacing rather than swallowing.
      if (
        !reason.includes("Could not establish connection") &&
        !reason.includes("Receiving end does not exist") &&
        !reason.includes("No tab with id")
      ) {
        console.warn("[agent-tab-lights] relay failed:", reason);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  hub.handleMessage(message, sender);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  hub.forgetTab(tabId);
});

// A top-level navigation replaces every frame in the tab, so drop the old
// reports rather than letting them linger until they expire.
//
// Only `status` is usable here: without the "tabs" permission Chrome strips
// changeInfo.url, so gating on it would mean this never ran.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    hub.forgetTab(tabId);
  }
});
