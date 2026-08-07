"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../lib/protocol.js");

// The top frame in Codespaces renders a name it never detected itself, so the
// label has to survive the merge alongside the state.
test("carries the winning frame's label", () => {
  const merged = protocol.mergeStates([
    { state: "idle", detectorId: "codex", label: "Codex" },
    { state: "working", detectorId: "claude-code", label: "Claude Code" }
  ]);

  assert.equal(merged.label, "Claude Code");
});

test("label is null when nothing is happening", () => {
  assert.equal(protocol.mergeStates([]).label, null);
});

test("a missing label does not break the merge", () => {
  const merged = protocol.mergeStates([{ state: "working", detectorId: "codex" }]);

  assert.equal(merged.state, "working");
  assert.equal(merged.label, null);
});
