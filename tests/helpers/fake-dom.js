"use strict";

// The detectors only ever touch querySelectorAll, attributes, textContent and
// closest, so a hand-rolled stand-in is enough and keeps the suite dependency
// free. Roots are keyed by the exact selector string a detector will ask for.
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

module.exports = { fakeElement, fakeRoot };
