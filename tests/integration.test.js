"use strict";

/*
 * Loads the real content scripts, in the real order the manifest declares, into
 * a content-script-shaped global — then drives them.
 *
 * The unit tests all reach past the entry files to the libraries underneath, so
 * nothing else in the suite would notice a manifest that loads scripts in the
 * wrong order, an entry file that dereferences something its block does not
 * load, or a detector that never gets matched to its host. Those are precisely
 * the failures that ship silently, because a content script that throws at
 * injection does so where nobody is looking.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createClock, createMutationObserverClass } = require("./helpers/fake-browser.js");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);

// Everything a content script is allowed to assume exists.
function createPageContext({ isTop = true, hostname = "example.test", title = "Example" } = {}) {
  const clock = createClock(1000);
  const FakeMutationObserver = createMutationObserverClass();
  const windowListeners = {};
  const documentListeners = {};
  const sent = [];
  let matches = {};

  const page = {
    console,
    performance: { now: clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    MutationObserver: FakeMutationObserver,
    location: { hostname, href: `https://${hostname}/c/1` },
    addEventListener(type, listener) {
      (windowListeners[type] ||= []).push(listener);
    },
    removeEventListener() {},
    document: {
      title,
      visibilityState: "visible",
      documentElement: { dataset: {} },
      querySelector: () => null,
      querySelectorAll: (selector) => matches[selector] || [],
      addEventListener(type, listener) {
        (documentListeners[type] ||= []).push(listener);
      },
      removeEventListener() {}
    },
    chrome: {
      runtime: {
        id: "fake-extension-id",
        lastError: null,
        onMessage: {
          listeners: [],
          addListener(listener) {
            this.listeners.push(listener);
          },
          removeListener(listener) {
            this.listeners = this.listeners.filter((entry) => entry !== listener);
          }
        },
        sendMessage(message, callback) {
          sent.push(message);
          callback?.();
        }
      },
      storage: {
        sync: {
          get: (_key, callback) => callback({}),
          set: (_items, callback) => callback?.()
        },
        onChanged: { addListener() {}, removeListener() {} }
      }
    }
  };

  page.window = page;
  page.globalThis = page;
  page.top = isTop ? page : { notThisFrame: true };

  return {
    page,
    clock,
    sent,
    context: vm.createContext(page),
    setMatches(next) {
      matches = next;
    },
    dispatch(type, event = {}) {
      (windowListeners[type] || []).forEach((listener) => listener({ type, ...event }));
    },
    documentDispatch(type, event = {}) {
      (documentListeners[type] || []).forEach((listener) => listener({ type, ...event }));
    },
    // A DOM change, coalesced the way the watcher does it.
    mutate() {
      FakeMutationObserver.instances
        .filter((observer) => !observer.disconnected)
        .forEach((observer) => observer.trigger());
      clock.advance(150);
    },
    relay(message) {
      page.chrome.runtime.onMessage.listeners.forEach((listener) =>
        listener(message, {}, () => {})
      );
    },
    ask() {
      let answer = null;
      page.chrome.runtime.onMessage.listeners.forEach((listener) =>
        listener(
          { type: "agent-tab-lights/get-state" },
          {},
          (value) => {
            answer = value;
          }
        )
      );
      return answer;
    },
    get title() {
      return page.document.title;
    }
  };
}

function loadBlock(harness, blockIndex) {
  for (const file of manifest.content_scripts[blockIndex].js) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), harness.context, {
      filename: file
    });
  }
}

// A stop button as a real page would render one.
function liveButton(text = "Stop") {
  return {
    textContent: text,
    hidden: false,
    disabled: false,
    getAttribute: () => null,
    closest: () => null,
    checkVisibility: () => true,
    getBoundingClientRect: () => ({ width: 32, height: 32 })
  };
}

test("every content script block loads without throwing, in manifest order", () => {
  manifest.content_scripts.forEach((block, index) => {
    for (const isTop of [true, false]) {
      if (!isTop && !block.all_frames) {
        continue;
      }

      const harness = createPageContext({
        isTop,
        hostname: block.matches[0]
          .replace("https://", "")
          .replace("/*", "")
          .replace("*.", "sub.")
      });

      assert.doesNotThrow(
        () => loadBlock(harness, index),
        `block ${index + 1} threw in the ${isTop ? "top frame" : "an iframe"}`
      );
    }
  });
});

test("a chat site goes orange while working and green when it stops", () => {
  const harness = createPageContext({ hostname: "chatgpt.com", title: "ChatGPT" });

  loadBlock(harness, 0);

  assert.equal(harness.title, "ChatGPT");

  harness.setMatches({ 'button[data-testid="stop-button"]': [liveButton()] });
  harness.mutate();

  assert.equal(harness.title, "🟠 ChatGPT");

  harness.setMatches({});
  harness.mutate();
  harness.clock.advance(2000);

  assert.equal(harness.title, "🟢 ChatGPT");
  assert.equal(harness.page.document.documentElement.dataset.agentTabLightsState, "done");
});

test("the host detector is resolved from the profile, not a lookup table", () => {
  // Forgetting to register a host used to leave a provider silently dead, with
  // the tab quietly falling back to relay mode and listening for nothing.
  const harness = createPageContext({ hostname: "chat.openai.com", title: "ChatGPT" });

  loadBlock(harness, 0);

  assert.equal(harness.ask().detectorId, "chatgpt");
  assert.equal(harness.ask().providerEnabled, true);
  // A chat site cannot host an agent panel, so the popup must not ask about one.
  assert.equal(harness.ask().expectsPanels, false);
});

test("www is stripped before matching a host", () => {
  const harness = createPageContext({ hostname: "www.perplexity.ai", title: "Perplexity" });

  loadBlock(harness, 0);

  assert.equal(harness.ask().detectorId, "perplexity");
});

test("a workbench tab renders state relayed from a panel", () => {
  const harness = createPageContext({
    hostname: "example.github.dev",
    title: "workspace - Visual Studio Code"
  });

  loadBlock(harness, 1);

  harness.relay({
    type: "agent-tab-lights/tab-state",
    state: "working",
    detectorId: "claude-code",
    label: "Claude Code",
    sources: 1
  });

  assert.equal(harness.title, "🟠 workspace - Visual Studio Code");
  assert.equal(harness.ask().label, "Claude Code");
  assert.equal(harness.ask().sources, 1);
});

test("an unidentified webview reports nothing at all", () => {
  // content-frame.js is injected into markdown previews and the settings
  // editor too. Reporting idle from those would count them as live sources.
  const harness = createPageContext({ isTop: false, hostname: "abc.vscode-cdn.net" });

  loadBlock(harness, 1);
  harness.clock.advance(30000);

  assert.deepEqual(harness.sent, []);
});

test("a webview that renders its panel after injection is still picked up", () => {
  const harness = createPageContext({ isTop: false, hostname: "abc.vscode-cdn.net" });

  loadBlock(harness, 1);
  assert.deepEqual(harness.sent, []);

  // The panel's app finishes booting a moment after document_idle.
  harness.setMatches({ '[data-testid*="claude" i]': [liveButton("Claude Code")] });
  harness.clock.advance(1100);
  harness.mutate();

  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0].type, "agent-tab-lights/frame-state");
  assert.equal(harness.sent[0].detectorId, "claude-code");
});

test("a webview withdraws itself when the panel goes away", () => {
  const harness = createPageContext({ isTop: false, hostname: "abc.vscode-cdn.net" });

  loadBlock(harness, 1);
  harness.setMatches({ '[data-testid*="claude" i]': [liveButton("Claude Code")] });
  harness.clock.advance(1100);
  harness.mutate();

  harness.dispatch("pagehide");

  const last = harness.sent[harness.sent.length - 1];
  assert.equal(last.type, "agent-tab-lights/frame-gone");
});

test("switching a site off mid-response clears the dot rather than greening it", () => {
  // Driven through the real settings listener, because the bug only appears on
  // the enabled -> disabled transition: the local report vanishing from the
  // merge is indistinguishable from an agent finishing, and the machine used to
  // settle that into a green dot that never cleared.
  const harness = createPageContext({ hostname: "chatgpt.com", title: "ChatGPT" });
  const listeners = [];

  harness.page.chrome.storage.onChanged.addListener = (listener) =>
    listeners.push(listener);

  loadBlock(harness, 0);

  harness.setMatches({ 'button[data-testid="stop-button"]': [liveButton()] });
  harness.mutate();
  assert.equal(harness.title, "🟠 ChatGPT");

  listeners.forEach((listener) =>
    listener({ settings: { newValue: { enabled: true, providers: { chatgpt: false } } } }, "sync")
  );
  harness.clock.advance(5000);

  assert.equal(harness.title, "ChatGPT");
  assert.equal(harness.ask().providerEnabled, false);
  assert.equal(harness.ask().detectorId, "chatgpt");
});

test("a tab restored from the back/forward cache comes back to life", () => {
  const harness = createPageContext({ hostname: "chatgpt.com", title: "ChatGPT" });

  loadBlock(harness, 0);

  harness.setMatches({ 'button[data-testid="stop-button"]': [liveButton()] });
  harness.mutate();
  assert.equal(harness.title, "🟠 ChatGPT");

  // Navigate away mid-response, then press Back.
  harness.dispatch("pagehide", { persisted: true });
  harness.dispatch("pageshow", { persisted: true });

  harness.setMatches({});
  harness.mutate();
  harness.clock.advance(2000);

  // Not frozen on orange, and still answering the popup.
  assert.equal(harness.title, "🟢 ChatGPT");
  assert.equal(harness.ask().ok, true);
});
