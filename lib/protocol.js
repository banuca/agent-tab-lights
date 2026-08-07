(function attachProtocol(globalScope) {
  "use strict";

  const messages = Object.freeze({
    // webview frame -> service worker
    frameState: "agent-tab-lights/frame-state",
    // webview frame -> service worker, on teardown
    frameGone: "agent-tab-lights/frame-gone",
    // service worker -> top frame
    tabState: "agent-tab-lights/tab-state"
  });

  // Frames report every heartbeat even when nothing changed, so the top frame
  // can tell "still idle" from "panel closed and stopped reporting".
  const heartbeatMs = 3000;
  const staleAfterMs = 12000;

  // Same order the detectors use: a live stop control beats a stale approval
  // prompt, which beats a lingering error banner.
  const priority = Object.freeze(["working", "waiting", "error", "idle"]);

  function rank(state) {
    const index = priority.indexOf(state);
    return index === -1 ? priority.length : index;
  }

  /**
   * Reduces several frames' reports to the one the tab should show. A tab can
   * legitimately have both a Claude Code and a Codex panel open at once, and
   * "something is still working" is the answer that matters.
   */
  function mergeStates(reports) {
    let best = "idle";
    let bestRank = rank("idle");
    let detectorId = null;
    let label = null;

    for (const report of reports) {
      const candidateRank = rank(report?.state);

      if (candidateRank < bestRank) {
        best = report.state;
        bestRank = candidateRank;
        detectorId = report.detectorId || null;
        // Carried through so the top frame can name the agent without needing
        // the provider detectors loaded itself.
        label = report.label || null;
      }
    }

    return { state: best, detectorId, label };
  }

  const protocol = Object.freeze({
    messages,
    heartbeatMs,
    staleAfterMs,
    priority,
    rank,
    mergeStates
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.protocol = protocol;

  if (typeof module === "object" && module.exports) {
    module.exports = protocol;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
