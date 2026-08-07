"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const detector = require("../detectors/chatgpt.js");
const { fakeElement, fakeRoot } = require("./helpers/fake-dom.js");

test("detects the ChatGPT stop control as working", () => {
  const stopButton = fakeElement();
  const root = fakeRoot({
    [detector.selectors.working[0]]: [stopButton]
  });

  assert.equal(detector.detect(root), "working");
});

test("detects a concise live thinking message as working", () => {
  const liveStatus = fakeElement({ text: "Thinking…" });
  const root = fakeRoot({
    [detector.selectors.live[0]]: [liveStatus]
  });

  assert.equal(detector.detect(root), "working");
});

test("ignores a hidden stop control", () => {
  const stopButton = fakeElement({ hidden: true });
  const root = fakeRoot({
    [detector.selectors.working[0]]: [stopButton]
  });

  assert.equal(detector.detect(root), "idle");
});

test("detects an approval action as waiting for input", () => {
  const approvalButton = fakeElement({ text: "Allow once" });
  const root = fakeRoot({
    [detector.selectors.actionButtons[0]]: [approvalButton]
  });

  assert.equal(detector.detect(root), "waiting");
});

test("detects a visible ChatGPT error", () => {
  const alert = fakeElement({ text: "Something went wrong. Please retry." });
  const root = fakeRoot({
    [detector.selectors.errors[0]]: [alert]
  });

  assert.equal(detector.detect(root), "error");
});

test("prioritises active work over a stale approval button", () => {
  const stopButton = fakeElement();
  const approvalButton = fakeElement({ text: "Approve" });
  const root = fakeRoot({
    [detector.selectors.working[0]]: [stopButton],
    [detector.selectors.actionButtons[0]]: [approvalButton]
  });

  assert.equal(detector.detect(root), "working");
});

test("returns idle when no state signal is present", () => {
  assert.equal(detector.detect(fakeRoot()), "idle");
});

test("ignores a CSS-hidden stop control", () => {
  // ChatGPT keeps the stop button mounted between turns; before the visibility
  // check this read as working forever.
  const stopButton = fakeElement({ visible: false });
  const root = fakeRoot({
    [detector.selectors.working[0]]: [stopButton]
  });

  assert.equal(detector.detect(root), "idle");
});

test("a finished message's Retry button is not an approval prompt", () => {
  // Retry sits under every completed response. Reading it as waiting turned
  // ordinary conversations yellow, and yellow used to decay into a false green.
  for (const label of ["Retry", "Continue generating", "Resume", "Reconnect"]) {
    const root = fakeRoot({
      [detector.selectors.actionButtons[0]]: [fakeElement({ text: label })]
    });

    assert.equal(detector.detect(root), "idle", label);
  }
});

test("an error banner with a Retry button still reads as an error", () => {
  // waiting is checked before error, so a Retry-shaped approval word would
  // have masked the banner entirely.
  const root = fakeRoot({
    [detector.selectors.errors[0]]: [
      fakeElement({ text: "Something went wrong." })
    ],
    [detector.selectors.actionButtons[0]]: [fakeElement({ text: "Retry" })]
  });

  assert.equal(detector.detect(root), "error");
});

test("claims the hosts the manifest injects it on", () => {
  assert.deepEqual(detector.hosts, ["chatgpt.com", "chat.openai.com"]);
});
