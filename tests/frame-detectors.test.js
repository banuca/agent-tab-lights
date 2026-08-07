"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fakeElement, fakeRoot } = require("./helpers/fake-dom.js");

const claudeCode = require("../detectors/claude-code.js");
const codex = require("../detectors/codex.js");
const generic = require("../detectors/generic-agent.js");
const claude = require("../detectors/claude.js");

const frameDetectors = [claudeCode, codex, generic];

// content-frame.js is injected into every webview in the VS Code workbench,
// including markdown previews and the settings editor. The identify gate is the
// only thing keeping those silent, so it gets tested harder than detection does.
test("frame detectors stay silent in an unrelated webview", () => {
  for (const detector of frameDetectors) {
    assert.equal(
      detector.identify(fakeRoot()),
      false,
      `${detector.id} claimed a webview with no agent markup`
    );
  }
});

test("frame detectors declare an identify gate at all", () => {
  for (const detector of frameDetectors) {
    assert.ok(
      detector.selectors.identify.length > 0,
      `${detector.id} has no identify selectors and would match every webview`
    );
  }
});

test("the Claude Code panel is identified by its own markup", () => {
  const root = fakeRoot({
    [claudeCode.selectors.identify[0]]: [fakeElement()]
  });

  assert.equal(claudeCode.identify(root), true);
});

test("the Codex panel is identified by its own markup", () => {
  const root = fakeRoot({
    [codex.selectors.identify[0]]: [fakeElement()]
  });

  assert.equal(codex.identify(root), true);
});

test("the generic fallback needs evidence of a chat surface", () => {
  const root = fakeRoot({
    [generic.selectors.identify[0]]: [fakeElement()]
  });

  assert.equal(generic.identify(root), true);
});

test("a hidden marker does not identify a panel", () => {
  const root = fakeRoot({
    [claudeCode.selectors.identify[0]]: [fakeElement({ hidden: true })]
  });

  assert.equal(claudeCode.identify(root), false);
});

test("frame detectors read a stop control as working", () => {
  for (const detector of frameDetectors) {
    const root = fakeRoot({
      [detector.selectors.working[0]]: [fakeElement()]
    });

    assert.equal(detector.detect(root), "working", detector.id);
  }
});

test("frame detectors ignore a disabled stop control", () => {
  for (const detector of frameDetectors) {
    const root = fakeRoot({
      [detector.selectors.working[0]]: [fakeElement({ disabled: true })]
    });

    assert.equal(detector.detect(root), "idle", detector.id);
  }
});

test("Claude Code reads its interrupt hint as working", () => {
  const root = fakeRoot({
    [claudeCode.selectors.live[0]]: [fakeElement({ text: "esc to interrupt" })]
  });

  assert.equal(claudeCode.detect(root), "working");
});

test("Claude Code reads a permission prompt as waiting", () => {
  const root = fakeRoot({
    [claudeCode.selectors.actionButtons[0]]: [
      fakeElement({ text: "Allow always" })
    ]
  });

  assert.equal(claudeCode.detect(root), "waiting");
});

test("Claude Code reads a plan approval as waiting", () => {
  const root = fakeRoot({
    [claudeCode.selectors.actionButtons[0]]: [
      fakeElement({ text: "Approve plan" })
    ]
  });

  assert.equal(claudeCode.detect(root), "waiting");
});

test("Codex reads a patch approval as waiting", () => {
  const root = fakeRoot({
    [codex.selectors.actionButtons[0]]: [fakeElement({ text: "Apply patch" })]
  });

  assert.equal(codex.detect(root), "waiting");
});

test("the generic fallback refuses to guess at approval prompts", () => {
  // Without knowing the provider we cannot tell an approval prompt from an
  // ordinary toolbar control, so a bare button selector must never appear here.
  assert.ok(
    !generic.selectors.actionButtons.includes("button"),
    "the generic detector would treat any button as an approval prompt"
  );
});

test("claude.ai streaming marker reads as working", () => {
  const root = fakeRoot({
    '[data-is-streaming="true"]': [fakeElement()]
  });

  assert.equal(claude.detect(root), "working");
});

test("claude.ai reads a tool permission prompt as waiting", () => {
  const root = fakeRoot({
    [claude.selectors.actionButtons[0]]: [fakeElement({ text: "Allow once" })]
  });

  assert.equal(claude.detect(root), "waiting");
});

test("claude.ai reads an interrupted response as an error", () => {
  const root = fakeRoot({
    [claude.selectors.errors[0]]: [
      fakeElement({ text: "Claude's response was interrupted." })
    ]
  });

  assert.equal(claude.detect(root), "error");
});

test("a long message quoting an error is not an error", () => {
  const root = fakeRoot({
    [claude.selectors.errors[0]]: [
      fakeElement({ text: `Here is why you saw a network error: ${"x".repeat(500)}` })
    ]
  });

  assert.equal(claude.detect(root), "idle");
});

test("every detector reports idle on an empty document", () => {
  for (const detector of [...frameDetectors, claude]) {
    assert.equal(detector.detect(fakeRoot()), "idle", detector.id);
  }
});
