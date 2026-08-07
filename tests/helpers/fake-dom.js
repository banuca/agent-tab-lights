"use strict";

// The detectors only ever touch querySelectorAll, attributes, textContent and
// closest, so a hand-rolled stand-in is enough and keeps the suite dependency
// free. Roots are keyed by the exact selector string a detector will ask for.
//
// `rect` and `visible` are opt-in: the real isActive() feature-detects
// getBoundingClientRect and checkVisibility, so elements that declare neither
// behave exactly as they did before those checks existed.
function fakeElement({
  text = "",
  attributes = {},
  hidden = false,
  disabled = false,
  hiddenParent = false,
  rect = null,
  visible = null
} = {}) {
  const element = {
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

  if (rect) {
    element.getBoundingClientRect = () => ({
      width: rect.width ?? 0,
      height: rect.height ?? 0
    });
  }

  if (visible !== null) {
    element.checkVisibility = () => visible;
  }

  return element;
}

function fakeRoot(matches = {}) {
  return {
    querySelectorAll(selector) {
      return matches[selector] || [];
    }
  };
}

module.exports = { fakeElement, fakeRoot };
