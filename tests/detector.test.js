"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const detector = require("../detectors/chatgpt.js");

function fakeElement({
  text = "",
  attributes = {},
  hidden = false,
  disabled = false,
  hiddenParent = false
} = {}) {
  return {
    textContent: text,
    hidden,
    disabled,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    closest() {
      return hiddenParent ? {} : null;
    }
  };
}

function fakeRoot(matches = {}) {
  return {
    querySelectorAll(selector) {
      return matches[selector] || [];
    }
  };
}

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
