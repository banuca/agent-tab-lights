"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../lib/protocol.js");

test("reports idle when no frame has said anything", () => {
  assert.equal(protocol.mergeStates([]).state, "idle");
});

test("a single frame's state passes through", () => {
  const merged = protocol.mergeStates([
    { state: "waiting", detectorId: "claude-code" }
  ]);

  assert.equal(merged.state, "waiting");
  assert.equal(merged.detectorId, "claude-code");
});

test("work in any panel wins over an idle panel", () => {
  const merged = protocol.mergeStates([
    { state: "idle", detectorId: "codex" },
    { state: "working", detectorId: "claude-code" }
  ]);

  assert.equal(merged.state, "working");
  assert.equal(merged.detectorId, "claude-code");
});

test("work outranks another panel waiting for input", () => {
  const merged = protocol.mergeStates([
    { state: "waiting", detectorId: "codex" },
    { state: "working", detectorId: "claude-code" }
  ]);

  assert.equal(merged.state, "working");
});

test("an input prompt outranks a lingering error banner", () => {
  const merged = protocol.mergeStates([
    { state: "error", detectorId: "codex" },
    { state: "waiting", detectorId: "claude-code" }
  ]);

  assert.equal(merged.state, "waiting");
});

test("an error outranks idle", () => {
  const merged = protocol.mergeStates([
    { state: "idle", detectorId: "claude-code" },
    { state: "error", detectorId: "codex" }
  ]);

  assert.equal(merged.state, "error");
});

test("an unrecognised state never outranks a real one", () => {
  const merged = protocol.mergeStates([
    { state: "banana", detectorId: "mystery" },
    { state: "idle", detectorId: "codex" }
  ]);

  assert.equal(merged.state, "idle");
});

test("a lone idle report still carries its label", () => {
  // An open-but-quiet panel is the only thing that can name the agent, so its
  // label has to survive the merge even though idle is the lowest rank.
  const merged = protocol.mergeStates([
    { state: "idle", detectorId: "claude-code", label: "Claude Code" }
  ]);

  assert.equal(merged.state, "idle");
  assert.equal(merged.detectorId, "claude-code");
  assert.equal(merged.label, "Claude Code");
});

test("nothing but unrecognised states reads as an unnamed idle", () => {
  const merged = protocol.mergeStates([
    { state: "banana", detectorId: "mystery", label: "Mystery" }
  ]);

  assert.deepEqual(merged, { state: "idle", detectorId: null, label: null });
});

test("the first report of a tied rank wins", () => {
  // The top frame relies on this: it lists the relayed panel report before its
  // own local detector, so a quiet panel names the tab rather than the host.
  const merged = protocol.mergeStates([
    { state: "idle", detectorId: "claude-code", label: "Claude Code" },
    { state: "idle", detectorId: "copilot-chat", label: "Copilot" }
  ]);

  assert.equal(merged.label, "Claude Code");
});

test("merge priority matches the detector priority order", () => {
  assert.deepEqual(protocol.priority, ["working", "waiting", "error", "idle"]);
});

test("frames heartbeat well inside the staleness window", () => {
  // Otherwise a quiet-but-open panel would be mistaken for a closed one.
  assert.ok(protocol.heartbeatMs * 2 < protocol.staleAfterMs);
});

test("the staleness window survives background-tab timer throttling", () => {
  // Chrome clamps timers in a hidden tab to roughly one per minute after a few
  // minutes. Anything under two of those ticks would expire a live panel's
  // report while it is still working - the exact case this extension is for.
  assert.ok(protocol.staleAfterMs > 2 * 60000);
});

test("the resend threshold leaves room for timer jitter", () => {
  // The safety interval fires at heartbeatMs and lands a hair early; comparing
  // against the full heartbeat made every other tick skip its send.
  assert.ok(protocol.heartbeatSlackMs < protocol.heartbeatMs);
});
