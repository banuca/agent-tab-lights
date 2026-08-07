(function attachDetectorKit(globalScope) {
  "use strict";

  // Text-length caps stop a long assistant message that happens to contain
  // "network error" from being read as a state signal.
  const defaultLimits = Object.freeze({
    working: 180,
    waiting: 80,
    error: 400
  });

  const emptyList = Object.freeze([]);
  const neverMatches = /(?!)/;

  function normaliseText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function elementText(element) {
    if (!element) {
      return "";
    }

    const candidates = [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.textContent
    ];

    return candidates.map(normaliseText).find(Boolean) || "";
  }

  function isActive(element) {
    if (!element || element.hidden || element.disabled) {
      return false;
    }

    if (element.getAttribute?.("aria-hidden") === "true") {
      return false;
    }

    const hiddenParent = element.closest?.(
      '[hidden], [aria-hidden="true"], [inert]'
    );

    return !hiddenParent;
  }

  // Some selectors we ship (notably the case-insensitive `i` attribute flag)
  // are unsupported on older engines. Degrade to no match instead of throwing
  // and taking the whole detector down with us.
  function queryAll(root, selector) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function hasActiveMatch(root, selectorList) {
    return selectorList.some((selector) =>
      queryAll(root, selector).some(isActive)
    );
  }

  function hasActiveTextMatch(root, selectorList, pattern, limit) {
    return selectorList.some((selector) =>
      queryAll(root, selector).some((element) => {
        const text = elementText(element);
        return isActive(element) && text.length <= limit && pattern.test(text);
      })
    );
  }

  function freezeList(value) {
    return Object.freeze(Array.isArray(value) ? value.slice() : emptyList.slice());
  }

  function createDetector(profile) {
    const selectors = Object.freeze({
      working: freezeList(profile?.selectors?.working),
      busy: freezeList(profile?.selectors?.busy),
      live: freezeList(profile?.selectors?.live),
      actionButtons: freezeList(profile?.selectors?.actionButtons),
      errors: freezeList(profile?.selectors?.errors),
      // Evidence that this provider's UI is present at all. Host-scoped
      // detectors can leave it empty, but frame-injected ones must not: we are
      // injected into every VS Code webview, including markdown previews and
      // the settings editor, and those must never report a state.
      identify: freezeList(profile?.selectors?.identify)
    });

    const text = Object.freeze({
      working: profile?.text?.working || neverMatches,
      waiting: profile?.text?.waiting || neverMatches,
      error: profile?.text?.error || neverMatches
    });

    const limits = Object.freeze({ ...defaultLimits, ...(profile?.limits || {}) });

    function isWorking(root) {
      if (
        hasActiveMatch(root, selectors.working) ||
        hasActiveMatch(root, selectors.busy)
      ) {
        return true;
      }

      return hasActiveTextMatch(root, selectors.live, text.working, limits.working);
    }

    function isWaiting(root) {
      return hasActiveTextMatch(
        root,
        selectors.actionButtons,
        text.waiting,
        limits.waiting
      );
    }

    function isError(root) {
      return hasActiveTextMatch(root, selectors.errors, text.error, limits.error);
    }

    // An empty identify list means "always applicable", which is correct for
    // detectors the manifest already scopes to a single host.
    function identify(root) {
      if (!root?.querySelectorAll) {
        return false;
      }

      if (!selectors.identify.length) {
        return true;
      }

      return hasActiveMatch(root, selectors.identify);
    }

    function detect(root) {
      if (!root?.querySelectorAll) {
        return "idle";
      }

      // A live stop control is the strongest signal and wins over stale notices.
      if (isWorking(root)) {
        return "working";
      }

      if (isWaiting(root)) {
        return "waiting";
      }

      if (isError(root)) {
        return "error";
      }

      return "idle";
    }

    return Object.freeze({
      id: profile?.id || "unknown",
      label: profile?.label || profile?.id || "Agent",
      detect,
      identify,
      selectors,
      text,
      limits
    });
  }

  const kit = Object.freeze({
    createDetector,
    normaliseText,
    elementText,
    isActive,
    queryAll,
    hasActiveMatch,
    hasActiveTextMatch,
    defaultLimits
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.kit = kit;
  namespace.detectors = namespace.detectors || {};

  // `module` is undefined in a content script; this branch exists only so the
  // test suite can require the same file the browser loads.
  if (typeof module === "object" && module.exports) {
    module.exports = kit;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
