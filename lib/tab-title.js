(function attachTabTitle(globalScope) {
  "use strict";

  const visualStates = Object.freeze({
    idle: Object.freeze({ prefix: "", label: "idle" }),
    working: Object.freeze({ prefix: "🟠 ", label: "is working" }),
    done: Object.freeze({ prefix: "🟢 ", label: "has finished" }),
    waiting: Object.freeze({ prefix: "🟡 ", label: "needs your input" }),
    error: Object.freeze({ prefix: "🔴 ", label: "encountered an error" })
  });

  const titlePrefix = /^(?:🟠|🟢|🟡|🔴)\s+/u;

  /**
   * Writes the status dot onto the tab title.
   *
   * Two properties matter here and both are load-bearing:
   *
   * 1. Stripping an existing prefix before adding one keeps this idempotent, so
   *    repeated renders cannot stack dots ("🟠 🟠 ChatGPT") when the host SPA
   *    rewrites document.title underneath us.
   * 2. Assigning only when the string actually differs. The MutationObserver
   *    that drives evaluation watches <title> too, so an unconditional write
   *    would retrigger itself forever.
   */
  function createTitleRenderer(options) {
    const doc = options?.document || globalScope.document;
    const root = options?.root || doc?.documentElement;
    const fallbackTitle = options?.fallbackTitle || "Agent";
    // May be a function: in relay mode we only learn which agent is reporting
    // after the first message arrives.
    const agentName = options?.agentName || "";

    function resolveAgentName() {
      return (typeof agentName === "function" ? agentName() : agentName) || "";
    }

    function cleanTitle() {
      return doc.title.replace(titlePrefix, "").trim() || fallbackTitle;
    }

    function describe(state) {
      const visual = visualStates[state] || visualStates.idle;
      const name = resolveAgentName();
      return name ? `${name} ${visual.label}` : visual.label;
    }

    function render(state) {
      const visual = visualStates[state] || visualStates.idle;
      const desiredTitle = `${visual.prefix}${cleanTitle()}`;

      if (doc.title !== desiredTitle) {
        doc.title = desiredTitle;
      }

      // Mirrored onto <html> as a debugging and user-styling hook. This is the
      // only other change the extension makes to the page.
      if (root?.dataset) {
        root.dataset.agentTabLightsState = state;
        root.dataset.agentTabLightsLabel = describe(state);
      }
    }

    return Object.freeze({ render, cleanTitle, describe });
  }

  const tabTitle = Object.freeze({
    createTitleRenderer,
    visualStates,
    titlePrefix
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.tabTitle = tabTitle;

  if (typeof module === "object" && module.exports) {
    module.exports = tabTitle;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
