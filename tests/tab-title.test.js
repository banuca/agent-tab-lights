"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createTitleRenderer } = require("../lib/tab-title.js");

function createFakeDocument(title) {
  const doc = { title, writes: 0 };

  // Counts assignments so we can prove the renderer does not write when the
  // value is unchanged - an unconditional write would retrigger the <title>
  // observer that drives evaluation.
  return {
    get title() {
      return doc.title;
    },
    set title(value) {
      doc.writes += 1;
      doc.title = value;
    },
    get writes() {
      return doc.writes;
    }
  };
}

function createFakeRoot() {
  return { dataset: {} };
}

test("adds a prefix for the current state", () => {
  const doc = createFakeDocument("ChatGPT");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("working");

  assert.equal(doc.title, "🟠 ChatGPT");
});

test("replaces an existing prefix instead of stacking one", () => {
  const doc = createFakeDocument("🟠 ChatGPT");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("done");

  assert.equal(doc.title, "🟢 ChatGPT");
});

test("is idempotent across repeated renders", () => {
  const doc = createFakeDocument("Claude");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("waiting");
  renderer.render("waiting");
  renderer.render("waiting");

  assert.equal(doc.title, "🟡 Claude");
});

test("does not write when the title already matches", () => {
  const doc = createFakeDocument("Claude");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("error");
  const writesAfterFirst = doc.writes;

  renderer.render("error");

  assert.equal(doc.writes, writesAfterFirst);
});

test("removes the prefix entirely when idle", () => {
  const doc = createFakeDocument("🔴 ChatGPT");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("idle");

  assert.equal(doc.title, "ChatGPT");
});

test("falls back to a readable title when the host leaves it empty", () => {
  const doc = createFakeDocument("");
  const renderer = createTitleRenderer({
    document: doc,
    root: createFakeRoot(),
    fallbackTitle: "Claude Code"
  });

  renderer.render("working");

  assert.equal(doc.title, "🟠 Claude Code");
});

test("mirrors state onto the root element for styling and debugging", () => {
  const root = createFakeRoot();
  const renderer = createTitleRenderer({
    document: createFakeDocument("Claude"),
    root,
    agentName: "Claude"
  });

  renderer.render("working");

  assert.equal(root.dataset.agentTabLightsState, "working");
  assert.equal(root.dataset.agentTabLightsLabel, "Claude is working");
});

test("resolves a late-bound agent name, as relay mode needs", () => {
  const root = createFakeRoot();
  let name = "Agent";

  const renderer = createTitleRenderer({
    document: createFakeDocument("Codespace"),
    root,
    agentName: () => name
  });

  renderer.render("working");
  assert.equal(root.dataset.agentTabLightsLabel, "Agent is working");

  name = "Claude Code";
  renderer.render("working");
  assert.equal(root.dataset.agentTabLightsLabel, "Claude Code is working");
});

test("treats an unknown state as idle rather than throwing", () => {
  const doc = createFakeDocument("🟠 ChatGPT");
  const renderer = createTitleRenderer({ document: doc, root: createFakeRoot() });

  renderer.render("nonsense");

  assert.equal(doc.title, "ChatGPT");
});
