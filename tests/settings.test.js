"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../lib/settings.js");

test("nothing stored means everything is on", () => {
  const resolved = settings.resolve(undefined);

  assert.equal(resolved.enabled, true);
  assert.equal(settings.isEnabled(resolved, "chatgpt"), true);
});

test("a provider nobody has ever heard of is on", () => {
  // The whole scheme rests on absent meaning enabled, which is what lets a new
  // provider ship without touching anyone's stored settings.
  const resolved = settings.resolve({
    settings: { enabled: true, providers: { chatgpt: false } }
  });

  assert.equal(settings.isEnabled(resolved, "a-provider-from-2027"), true);
});

test("a provider switched off stays off", () => {
  const resolved = settings.resolve({
    settings: { providers: { claude: false } }
  });

  assert.equal(settings.isEnabled(resolved, "claude"), false);
  assert.equal(settings.isEnabled(resolved, "chatgpt"), true);
});

test("the master switch beats every provider", () => {
  const resolved = settings.resolve({
    settings: { enabled: false, providers: { claude: true } }
  });

  assert.equal(settings.isEnabled(resolved, "claude"), false);
});

test("a state with no provider only consults the master switch", () => {
  // Relay-only tabs have no local detector to name.
  const on = settings.resolve({ settings: { enabled: true } });
  const off = settings.resolve({ settings: { enabled: false } });

  assert.equal(settings.isEnabled(on, null), true);
  assert.equal(settings.isEnabled(off, null), false);
});

test("resolved settings cannot be mutated by a caller", () => {
  const resolved = settings.resolve({ settings: { providers: { claude: false } } });

  assert.throws(() => {
    resolved.providers.claude = true;
  }, TypeError);
});

test("load falls back to the defaults with no storage available", () => {
  // lib/settings.js is loaded in contexts that may predate the permission.
  let received = null;

  settings.load((value) => {
    received = value;
  });

  assert.deepEqual(received, settings.defaults);
});

test("saving without storage reports no error", () => {
  return settings.save({ enabled: false }).then((error) => {
    assert.equal(error, null);
  });
});

test("subscribing without storage is a no-op, not a crash", () => {
  const unsubscribe = settings.subscribe(() => {});

  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
});
