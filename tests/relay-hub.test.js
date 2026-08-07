"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../lib/protocol.js");
const { createRelayHub } = require("../lib/relay-hub.js");

function createHarness() {
  const published = [];
  let clock = 1000;

  const hub = createRelayHub({
    protocol,
    sendToTab: (tabId, message) => published.push({ tabId, message }),
    now: () => clock
  });

  return {
    hub,
    published,
    advance(ms) {
      clock += ms;
    },
    last() {
      return published[published.length - 1]?.message;
    },
    report(tabId, frameId, state, extras = {}) {
      return hub.handleMessage(
        {
          type: protocol.messages.frameState,
          state,
          detectorId: extras.detectorId ?? "claude-code",
          label: extras.label ?? "Claude Code"
        },
        { tab: { id: tabId }, frameId }
      );
    },
    gone(tabId, frameId) {
      return hub.handleMessage(
        { type: protocol.messages.frameGone, detectorId: "claude-code" },
        { tab: { id: tabId }, frameId }
      );
    }
  };
}

test("a frame report is published to the tab's top frame", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");

  assert.equal(harness.published.length, 1);
  assert.equal(harness.published[0].tabId, 7);
  assert.deepEqual(harness.last(), {
    type: protocol.messages.tabState,
    state: "working",
    detectorId: "claude-code",
    label: "Claude Code",
    sources: 1
  });
});

test("two panels in one tab merge to the state that matters", () => {
  const harness = createHarness();

  harness.report(7, 2, "idle", { detectorId: "codex", label: "Codex" });
  harness.report(7, 3, "working");

  assert.equal(harness.last().state, "working");
  assert.equal(harness.last().label, "Claude Code");
  assert.equal(harness.last().sources, 2);
});

test("a panel that closes stops counting immediately", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");
  harness.report(7, 3, "idle", { detectorId: "codex", label: "Codex" });

  harness.gone(7, 2);

  assert.equal(harness.last().state, "idle");
  assert.equal(harness.last().sources, 1);
});

test("a teardown message for an unknown frame publishes nothing", () => {
  const harness = createHarness();

  const handled = harness.gone(7, 2);

  assert.equal(handled, true);
  assert.equal(harness.published.length, 0);
});

test("reports older than the staleness window are dropped", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");
  harness.advance(protocol.staleAfterMs + 1);
  harness.report(7, 3, "idle", { detectorId: "codex", label: "Codex" });

  // The crashed panel's working report must not outlive it.
  assert.equal(harness.last().state, "idle");
  assert.equal(harness.last().sources, 1);
});

test("a report inside the staleness window survives", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");
  harness.advance(protocol.staleAfterMs - 1000);
  harness.report(7, 3, "idle", { detectorId: "codex", label: "Codex" });

  assert.equal(harness.last().state, "working");
  assert.equal(harness.last().sources, 2);
});

test("closing a tab forgets its frames", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");
  harness.hub.forgetTab(7);

  assert.equal(harness.hub.tabCount, 0);
  assert.equal(harness.hub.frameCount(7), 0);
});

test("tabs are kept apart", () => {
  const harness = createHarness();

  harness.report(7, 2, "working");
  harness.report(8, 2, "idle", { detectorId: "codex", label: "Codex" });

  assert.equal(harness.hub.frameCount(7), 1);
  assert.equal(harness.hub.frameCount(8), 1);
  assert.equal(harness.published[1].tabId, 8);
  assert.equal(harness.published[1].message.state, "idle");
});

test("messages from outside a tab are ignored", () => {
  const harness = createHarness();

  const handled = harness.hub.handleMessage(
    { type: protocol.messages.frameState, state: "working" },
    { frameId: 0 }
  );

  assert.equal(handled, false);
  assert.equal(harness.published.length, 0);
});

test("unrelated messages are left alone", () => {
  const harness = createHarness();

  const handled = harness.hub.handleMessage(
    { type: "something-else" },
    { tab: { id: 7 }, frameId: 2 }
  );

  assert.equal(handled, false);
  assert.equal(harness.published.length, 0);
});
