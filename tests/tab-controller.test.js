"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../lib/protocol.js");
const tabTitleKit = require("../lib/tab-title.js");
const stateMachineKit = require("../lib/state-machine.js");
const { createWatcher } = require("../lib/watcher.js");
const { createTabController } = require("../lib/tab-controller.js");
const {
  createClock,
  createMutationObserverClass,
  createEventEmitter,
  createFakeDocument
} = require("./helpers/fake-browser.js");
const { createListenerSlot } = require("./helpers/fake-chrome.js");

function fakeLocalDetector({ id = "copilot-chat", label = "Copilot" } = {}) {
  const state = { detected: "idle", present: true };

  return {
    id,
    label,
    hosts: ["*.github.dev"],
    detect: () => state.detected,
    identify: () => state.present,
    state
  };
}

function createHarness({
  localDetector = null,
  detectors = {},
  disabledProviders = [],
  expectsPanels = false
} = {}) {
  // Mutable so a test can switch a provider off mid-run, which is the only way
  // a real user reaches that transition.
  const disabled = new Set(disabledProviders);
  const clock = createClock(1000);
  const FakeMutationObserver = createMutationObserverClass();
  const eventTarget = createEventEmitter();
  const doc = createFakeDocument({ title: "Workbench" });
  const onMessage = createListenerSlot();
  const location = { href: "https://example.test/a" };

  const controller = createTabController({
    protocol,
    document: doc,
    globalScope: { location },
    tabTitleKit,
    stateMachineKit,
    getDetectors: () => detectors,
    localDetector,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    MutationObserver: FakeMutationObserver,
    runtime: { onMessage },
    expectsPanels,
    isProviderEnabled: (id) => !disabled.has(id),
    createWatcher: localDetector
      ? (watcherOptions) =>
          createWatcher({
            ...watcherOptions,
            target: { tag: "html" },
            MutationObserver: FakeMutationObserver,
            setTimeout: clock.setTimeout,
            clearTimeout: clock.clearTimeout,
            setInterval: clock.setInterval,
            clearInterval: clock.clearInterval,
            eventTarget
          })
      : null
  });

  return {
    controller,
    clock,
    doc,
    location,
    onMessage,
    eventTarget,
    FakeMutationObserver,
    setProviderEnabled(id, value) {
      if (value) {
        disabled.delete(id);
      } else {
        disabled.add(id);
      }

      controller.refreshProviders();
    },
    relay(state, extras = {}) {
      onMessage.emit(
        {
          type: protocol.messages.tabState,
          state,
          detectorId: extras.detectorId ?? "claude-code",
          // Not ??: a test that relays a null label is exercising the fallback.
          label: "label" in extras ? extras.label : "Claude Code",
          sources: extras.sources ?? 1
        },
        {},
        () => {}
      );
    },
    ask() {
      let answer = null;
      onMessage.emit(
        { type: protocol.messages.getState },
        {},
        (value) => {
          answer = value;
        }
      );
      return answer;
    }
  };
}

test("a relayed working report turns the title orange", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");

  assert.equal(harness.controller.state, "working");
  assert.match(harness.doc.title, /^🟠 /);
});

test("a quiet panel names the tab before it does any work", () => {
  // The label used to be dropped for idle reports, so a Codespace showed the
  // placeholder "Agent" until the first thing happened.
  const harness = createHarness();

  harness.controller.start();
  harness.relay("idle");

  assert.equal(harness.controller.agentName, "Claude Code");
});

test("each report arms a one-shot timer to expire it", () => {
  // Interval timers are throttled to roughly once a minute in a hidden tab, so
  // expiry cannot ride on the safety interval. A one-shot armed from the
  // message callback has timer nesting 0 and stays accurate while backgrounded.
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");

  assert.ok(
    harness.clock.pendingDelays.some((delay) => delay > protocol.staleAfterMs),
    `no expiry timer armed: ${harness.clock.pendingDelays}`
  );
});

test("a panel that stops reporting does not stay orange forever", () => {
  // Silence is indistinguishable from finishing, so a panel that was working
  // and then vanished settles to green rather than freezing mid-run.
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");

  harness.clock.advance(protocol.staleAfterMs + 10000);

  assert.equal(harness.controller.state, "done");
});

test("a panel that was never busy leaves no light behind", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("idle");

  harness.clock.advance(protocol.staleAfterMs + 10000);

  assert.equal(harness.controller.state, "idle");
  assert.equal(harness.doc.title, "Workbench");
});

test("a working panel survives well past the old staleness window", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");
  harness.clock.advance(60000);

  assert.equal(harness.controller.state, "working");
});

test("a local detector drives the title on its own", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  detector.state.detected = "working";
  harness.controller.evaluate();

  assert.equal(harness.controller.state, "working");
  assert.equal(harness.controller.agentName, "Copilot");
});

test("local work outranks an idle panel", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.relay("idle");
  detector.state.detected = "working";
  harness.controller.evaluate();

  assert.equal(harness.controller.state, "working");
  assert.equal(harness.controller.agentName, "Copilot");
});

test("a working panel outranks an idle local detector", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.relay("working");

  assert.equal(harness.controller.state, "working");
  assert.equal(harness.controller.agentName, "Claude Code");
});

test("with both quiet, the panel names the tab", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.relay("idle");

  assert.equal(harness.controller.state, "idle");
  assert.equal(harness.controller.agentName, "Claude Code");
});

test("one state machine spans both sources", () => {
  // Work in the panel then quiet everywhere has to settle to green once, not
  // race two machines against each other.
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.relay("working");
  harness.relay("idle");
  harness.clock.advance(2000);

  assert.equal(harness.controller.state, "done");
});

test("the popup gets a straight answer about this tab", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working", { sources: 2 });

  assert.deepEqual(harness.ask(), {
    ok: true,
    enabled: true,
    providerEnabled: true,
    expectsPanels: false,
    state: "working",
    detectorId: "claude-code",
    label: "Claude Code",
    observedWork: true,
    sources: 2
  });
});

test("the popup is answered on a local-detector tab too", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();

  const answer = harness.ask();

  assert.equal(answer.ok, true);
  assert.equal(answer.detectorId, "copilot-chat");
  assert.equal(answer.sources, 0);
});

test("a host detector that is not on the page does not name the tab", () => {
  // Copilot Chat shares its host with every other workbench tab, so a
  // Codespace with the chat view closed must not be attributed to it.
  const detector = fakeLocalDetector();
  detector.state.present = false;
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.relay("working");

  assert.equal(harness.controller.agentName, "Claude Code");
  assert.equal(harness.ask().detectorId, "claude-code");
});

test("a host detector that is not on the page contributes no state", () => {
  const detector = fakeLocalDetector();
  detector.state.present = false;
  detector.state.detected = "working";
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();

  assert.equal(harness.controller.state, "idle");
});

test("a label falls back to the detector registry", () => {
  const harness = createHarness({
    detectors: { codex: { id: "codex", label: "Codex" } }
  });

  harness.controller.start();
  harness.relay("working", { detectorId: "codex", label: null });

  assert.equal(harness.controller.agentName, "Codex");
});

test("turning the extension off leaves no trace on the page", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");
  assert.match(harness.doc.title, /^🟠 /);

  harness.controller.setEnabled(false);

  assert.equal(harness.doc.title, "Workbench");
  assert.equal(harness.doc.documentElement.dataset.agentTabLightsState, undefined);
});

test("a disabled tab ignores incoming reports", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.controller.setEnabled(false);
  harness.relay("working");

  assert.equal(harness.doc.title, "Workbench");
});

test("turning it back on restores the light without a reload", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.controller.setEnabled(false);
  harness.controller.setEnabled(true);
  harness.relay("working");

  assert.match(harness.doc.title, /^🟠 /);
});

test("dispose releases every listener and timer", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  assert.equal(harness.onMessage.count, 1);

  harness.controller.dispose();

  assert.equal(harness.onMessage.count, 0);
  assert.equal(harness.clock.pendingCount, 0);
});

test("a disposed controller stops writing to the page", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");
  const titleAtDispose = harness.doc.title;

  harness.controller.dispose();
  harness.clock.advance(60000);

  assert.equal(harness.doc.title, titleAtDispose);
});

test("a bfcache restore brings the whole controller back", () => {
  // In a real page the watcher and content-top.js share a window, so the
  // pagehide that stops the watcher also disposes the controller. Resuming has
  // to rebuild, not nudge - otherwise the tab comes back with a frozen dot and
  // no listener to answer the popup.
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.eventTarget.dispatch("pagehide");
  harness.controller.dispose();

  assert.equal(harness.onMessage.count, 0);

  detector.state.detected = "working";
  harness.controller.resume();

  assert.equal(harness.controller.state, "working");
  assert.equal(harness.onMessage.count, 1);
  assert.match(harness.doc.title, /^🟠 /);
});

test("starting twice does not stack listeners or timers", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  const timersAfterFirstStart = harness.clock.pendingCount;

  harness.controller.start();

  assert.equal(harness.onMessage.count, 1);
  assert.equal(harness.clock.pendingCount, timersAfterFirstStart);
});

test("switching off the host provider still shows relayed panels", () => {
  // Copilot Chat shares its host with every Codespaces tab. Switching it off
  // must not blind the tab to the Claude Code panel sitting next to it.
  const detector = fakeLocalDetector();
  const harness = createHarness({
    localDetector: detector,
    disabledProviders: ["copilot-chat"]
  });

  harness.controller.start();
  harness.relay("working");

  assert.equal(harness.controller.state, "working");
  assert.equal(harness.controller.agentName, "Claude Code");
  assert.match(harness.doc.title, /^🟠 /);
});

test("a switched-off host provider contributes nothing itself", () => {
  const detector = fakeLocalDetector();
  detector.state.detected = "working";
  const harness = createHarness({
    localDetector: detector,
    disabledProviders: ["copilot-chat"]
  });

  harness.controller.start();

  assert.equal(harness.controller.state, "idle");
});

test("switching a provider off mid-run removes the dot instead of greening it", () => {
  // Dropping the local report out of the merge looks exactly like an agent
  // going quiet, which the machine would settle to a permanent green - the very
  // dot the user just asked to get rid of.
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  detector.state.detected = "working";
  harness.controller.evaluate();
  assert.match(harness.doc.title, /^🟠 /);

  harness.setProviderEnabled("copilot-chat", false);
  harness.clock.advance(5000);

  assert.equal(harness.controller.state, "idle");
  assert.equal(harness.doc.title, "Workbench");
});

test("switching a provider off does not green a tab that was already green", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  detector.state.detected = "working";
  harness.controller.evaluate();

  detector.state.detected = "idle";
  harness.controller.evaluate();
  harness.clock.advance(2000);
  assert.equal(harness.controller.state, "done");

  harness.setProviderEnabled("copilot-chat", false);
  harness.clock.advance(5000);

  assert.equal(harness.doc.title, "Workbench");
});

test("switching a provider back on picks detection up again", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  harness.setProviderEnabled("copilot-chat", false);

  detector.state.detected = "working";
  harness.setProviderEnabled("copilot-chat", true);

  assert.equal(harness.controller.state, "working");
});

test("the popup can tell a provider switch from the master switch", () => {
  const detector = fakeLocalDetector();
  const harness = createHarness({ localDetector: detector });

  harness.controller.start();
  assert.equal(harness.ask().providerEnabled, true);

  harness.setProviderEnabled("copilot-chat", false);

  const answer = harness.ask();
  assert.equal(answer.enabled, true, "the master switch is untouched");
  assert.equal(answer.providerEnabled, false);
  // Still named, so the popup can highlight the row to switch back on.
  assert.equal(answer.detectorId, "copilot-chat");
});

test("a chat tab does not claim to be missing an agent panel", () => {
  // expectsPanels is what stops the popup saying "no agent panel detected in
  // this tab" on chatgpt.com.
  const harness = createHarness({ localDetector: fakeLocalDetector() });

  harness.controller.start();

  assert.equal(harness.ask().expectsPanels, false);
});

test("a workbench tab reports that it expects panels", () => {
  const harness = createHarness({ expectsPanels: true });

  harness.controller.start();

  assert.equal(harness.ask().expectsPanels, true);
  assert.equal(harness.ask().sources, 0);
});

test("an expired report stops naming the tab", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("idle");
  assert.equal(harness.controller.agentName, "Claude Code");

  harness.clock.advance(protocol.staleAfterMs + 10000);

  assert.equal(harness.controller.agentName, "Agent");
  assert.equal(harness.ask().detectorId, null);
});

test("navigating within the SPA resets the light", () => {
  const harness = createHarness();

  harness.controller.start();
  harness.relay("working");

  harness.location.href = "https://example.test/b";
  harness.relay("idle");

  assert.equal(harness.controller.state, "idle");
});
