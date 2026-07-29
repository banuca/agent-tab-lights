(function attachChatGPTDetector(globalScope) {
  "use strict";

  const selectors = Object.freeze({
    working: Object.freeze([
      'button[data-testid="stop-button"]',
      '[data-testid="stop-button"]',
      'button[aria-label*="stop generating" i]',
      'button[aria-label*="stop response" i]',
      'button[aria-label*="stop streaming" i]',
      'button[title*="stop generating" i]',
      '[data-testid*="stop" i][role="button"]'
    ]),
    busy: Object.freeze([
      'main[aria-busy="true"]',
      'main form[aria-busy="true"]',
      'main [data-testid*="conversation-turn" i][aria-busy="true"]'
    ]),
    live: Object.freeze([
      'main [role="status"]',
      'main [aria-live="assertive"]',
      'main [aria-live="polite"]'
    ]),
    actionButtons: Object.freeze([
      '[role="dialog"] button',
      'main button[data-testid*="approve" i]',
      'main button[data-testid*="allow" i]',
      'main button[data-testid*="confirm" i]',
      'main button'
    ]),
    errors: Object.freeze([
      'main [role="alert"]',
      'main [data-testid*="error" i]'
    ])
  });

  const workingText =
    /\bchatgpt is (?:working|thinking|generating)\b|^(?:working|thinking|running|searching|browsing|analysing|analyzing|generating|writing|reading|creating)(?:\b|…|\.\.\.)/i;

  const waitingText =
    /^(?:approve|allow(?: once| for (?:this|all) sites?)?|confirm|continue(?: generating)?|grant access|reconnect|retry|run anyway|yes,?\s*continue)$/i;

  const errorText =
    /\b(?:something went wrong|network error|there was an error|failed to (?:load|respond|generate)|connection lost|unexpected error)\b/i;

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

  function isWorking(root) {
    if (
      hasActiveMatch(root, selectors.working) ||
      hasActiveMatch(root, selectors.busy)
    ) {
      return true;
    }

    return selectors.live.some((selector) =>
      queryAll(root, selector).some((element) => {
        const text = elementText(element);
        return isActive(element) && text.length <= 180 && workingText.test(text);
      })
    );
  }

  function isWaiting(root) {
    return selectors.actionButtons.some((selector) =>
      queryAll(root, selector).some((element) => {
        const text = elementText(element);
        return isActive(element) && text.length <= 80 && waitingText.test(text);
      })
    );
  }

  function isError(root) {
    return selectors.errors.some((selector) =>
      queryAll(root, selector).some((element) => {
        const text = elementText(element);
        return isActive(element) && text.length <= 400 && errorText.test(text);
      })
    );
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

  const detector = Object.freeze({
    detect,
    selectors
  });

  globalScope.AgentTabLights = globalScope.AgentTabLights || {};
  globalScope.AgentTabLights.chatgpt = detector;

  if (typeof module === "object" && module.exports) {
    module.exports = detector;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
