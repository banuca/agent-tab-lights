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

test("merge priority matches the detector priority order", () => {
  assert.deepEqual(protocol.priority, ["working", "waiting", "error", "idle"]);
});

test("frames heartbeat well inside the staleness window", () => {
  // Otherwise a quiet-but-open panel would be mistaken for a closed one.
  assert.ok(protocol.heartbeatMs * 2 < protocol.staleAfterMs);
});
