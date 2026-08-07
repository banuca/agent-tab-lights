"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vocab = require("../lib/vocab.js");

test("a live region opening with a gerund reads as working", () => {
  const pattern = vocab.workingText();

  for (const text of ["Thinking…", "Searching the web", "Running...", "Writing"]) {
    assert.ok(pattern.test(text), text);
  }
});

test("a named agent working reads as working", () => {
  const pattern = vocab.workingText({ agentNames: ["claude"] });

  assert.ok(pattern.test("Claude is thinking"));
  assert.ok(pattern.test("Claude is writing"));
});

test("prose that merely mentions a verb is not a working signal", () => {
  const pattern = vocab.workingText();

  assert.equal(pattern.test("I finished writing the file"), false);
  assert.equal(pattern.test("Here is what I was thinking"), false);
});

test("provider-specific hints can be added", () => {
  const pattern = vocab.workingText({ extraPhrases: ["esc to interrupt"] });

  assert.ok(pattern.test("esc to interrupt"));
});

test("approval words read as waiting", () => {
  const pattern = vocab.waitingText();

  for (const label of [
    "Approve",
    "Allow once",
    "Always allow",
    "Accept edits",
    "Confirm",
    "Yes, continue",
    "Yes continue",
    "Run command"
  ]) {
    assert.ok(pattern.test(label), label);
  }
});

test("recovery and resume controls are never approvals", () => {
  // These sit under finished messages on every provider. Treating them as
  // approval prompts is what made ordinary conversations read as waiting.
  const pattern = vocab.waitingText();

  for (const label of [
    "Retry",
    "Reconnect",
    "Resume",
    "Continue",
    "Continue generating",
    "Regenerate",
    "Edit",
    "Copy",
    "Cancel",
    "Stop"
  ]) {
    assert.equal(pattern.test(label), false, label);
  }
});

test("a typographic apostrophe reads the same as a plain one", () => {
  // VS Code and Claude Code render U+2019. Spelling only U+0027 meant the
  // yellow light never appeared for that approval button.
  const pattern = vocab.waitingText();

  assert.ok(pattern.test("Yes, and don't ask again"));
  assert.ok(pattern.test("Yes, and don’t ask again"));
});

test("waiting matches the whole label, not a fragment", () => {
  const pattern = vocab.waitingText();

  assert.equal(pattern.test("Approve this and seventeen other changes"), false);
  assert.equal(pattern.test("Do not allow"), false);
});

test("a provider can opt into its own approval wording", () => {
  const pattern = vocab.waitingText({ extra: ["keep planning"] });

  assert.ok(pattern.test("Keep planning"));
  assert.equal(vocab.waitingText().test("Keep planning"), false);
});

test("common failure phrases read as errors", () => {
  const pattern = vocab.errorText();

  for (const text of [
    "Something went wrong",
    "A network error occurred",
    "Failed to respond",
    "Connection lost. Reconnecting…",
    "Internal server error"
  ]) {
    assert.ok(pattern.test(text), text);
  }
});

test("provider-specific failures can be added", () => {
  const pattern = vocab.errorText({ extra: ["server is busy"] });

  assert.ok(pattern.test("The server is busy, try again"));
  assert.equal(vocab.errorText().test("The server is busy"), false);
});

test("no shared selector group would match an arbitrary control", () => {
  // Every selector here has to name what it targets. A bare tag selector in
  // any of these groups reintroduces the false-positive class they exist to
  // avoid.
  const groups = Object.values(vocab.selectors).flat();

  for (const selector of groups) {
    assert.ok(
      /[[.#]/.test(selector),
      `${selector} matches by tag alone and would hit unrelated UI`
    );
  }
});
