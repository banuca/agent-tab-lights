"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const kit = require("../lib/detector-kit.js");
const { fakeElement } = require("./helpers/fake-dom.js");

test("a plain element is active", () => {
  assert.equal(kit.isActive(fakeElement({ text: "Stop" })), true);
});

test("aria-disabled counts as inactive", () => {
  // Custom controls are rendered as <div role="button" aria-disabled="true">,
  // where the DOM `disabled` property is never set.
  const element = fakeElement({ attributes: { "aria-disabled": "true" } });

  assert.equal(kit.isActive(element), false);
});

test("a CSS-hidden control is inactive", () => {
  // The stuck-orange bug: sites keep the stop button mounted between turns.
  const element = fakeElement({ text: "Stop", visible: false });

  assert.equal(kit.isActive(element), false);
});

test("a zero-size control is inactive", () => {
  const element = fakeElement({ text: "Stop", rect: { width: 0, height: 0 } });

  assert.equal(kit.isActive(element), false);
});

test("a control with a real box is active", () => {
  const element = fakeElement({
    text: "Stop",
    visible: true,
    rect: { width: 32, height: 32 }
  });

  assert.equal(kit.isActive(element), true);
});

test("an element that reports neither box nor visibility is still active", () => {
  // Both checks are feature-detected, so engines without them degrade to the
  // attribute checks rather than treating everything as hidden.
  assert.equal(kit.isActive(fakeElement({ text: "Stop" })), true);
});

test("matchesHost handles exact hosts", () => {
  assert.equal(kit.matchesHost("claude.ai", "claude.ai"), true);
  assert.equal(kit.matchesHost("notclaude.ai", "claude.ai"), false);
  assert.equal(kit.matchesHost("app.claude.ai", "claude.ai"), false);
});

test("a wildcard host also matches the apex", () => {
  assert.equal(kit.matchesHost("perplexity.ai", "*.perplexity.ai"), true);
  assert.equal(kit.matchesHost("www.perplexity.ai", "*.perplexity.ai"), true);
  assert.equal(kit.matchesHost("a.b.github.dev", "*.github.dev"), true);
  assert.equal(kit.matchesHost("perplexity.ai.evil.com", "*.perplexity.ai"), false);
});

test("findLocalDetector picks the detector that claims the host", () => {
  const registry = {
    chatgpt: kit.createDetector({
      id: "chatgpt",
      hosts: ["chatgpt.com", "chat.openai.com"]
    }),
    claude: kit.createDetector({ id: "claude", hosts: ["claude.ai"] }),
    "claude-code": kit.createDetector({ id: "claude-code" })
  };

  assert.equal(kit.findLocalDetector(registry, "chat.openai.com").id, "chatgpt");
  assert.equal(kit.findLocalDetector(registry, "claude.ai").id, "claude");
  assert.equal(kit.findLocalDetector(registry, "example.test"), null);
});

test("a frame-only detector is never selected for a host", () => {
  // Panel detectors declare no hosts; picking one in the top frame would make
  // it fight the real local detector.
  const registry = {
    "claude-code": kit.createDetector({ id: "claude-code" })
  };

  assert.equal(kit.findLocalDetector(registry, "anything.test"), null);
});

test("a missing registry is not an error", () => {
  assert.equal(kit.findLocalDetector(undefined, "claude.ai"), null);
});
