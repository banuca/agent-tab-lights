(function attachProtocol(globalScope) {
  "use strict";

  const messages = Object.freeze({
    // webview frame -> service worker
    frameState: "agent-tab-lights/frame-state",
    // webview frame -> service worker, on teardown
    frameGone: "agent-tab-lights/frame-gone",
    // service worker -> top frame
    tabState: "agent-tab-lights/tab-state",
    // popup -> top frame
    getState: "agent-tab-lights/get-state"
  });

  // Frames report every heartbeat even when nothing changed, so the top frame
  // can tell "still idle" from "panel closed and stopped reporting".
  const heartbeatMs = 3000;

  // Resend slightly before a full heartbeat has elapsed. The safety interval
  // ticks at heartbeatMs, and timer jitter means it lands a hair under that;
  // comparing against the full heartbeat silently halved the real rate.
  const heartbeatSlackMs = 2400;

  /*
   * Deliberately far larger than the heartbeat. Chrome throttles timers in
   * hidden tabs to roughly once a minute after ~5 minutes, which is exactly the
   * situation this extension exists for: a long agent run in a backgrounded
   * tab. A 12s window meant a still-working panel decayed to idle and the light
   * went out. Freshness is therefore only a crash fallback here - a panel that
   * closes deliberately sends frameGone, and a top-level navigation clears the
   * tab via chrome.tabs.onUpdated, so neither relies on expiry.
   */
  const staleAfterMs = 150000;

  // Same order the detectors use: a live stop control beats a stale approval
  // prompt, which beats a lingering error banner.
  const priority = Object.freeze(["working", "waiting", "error", "idle"]);

  function rank(state) {
    const index = priority.indexOf(state);
    return index === -1 ? priority.length : index;
  }

  /**
   * Reduces several reports to the one the tab should show. A tab can
   * legitimately have both a Claude Code and a Codex panel open at once, and
   * "something is still working" is the answer that matters.
   *
   * Also used by the top frame to fold its own local detector in with the
   * relayed panel state, so a workbench running Copilot Chat and Claude Code
   * resolves to a single light.
   */
  function mergeStates(reports) {
    let best = "idle";
    // Starting above every real rank, so the first valid report always wins.
    // Seeding with rank("idle") meant an idle report could never be chosen and
    // its label never propagated - a quiet panel stayed nameless.
    let bestRank = Infinity;
    let detectorId = null;
    let label = null;

    for (const report of reports || []) {
      const candidateRank = rank(report?.state);

      // Unrecognised states are not reports at all; skip rather than rank them.
      if (candidateRank >= priority.length) {
        continue;
      }

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
    heartbeatSlackMs,
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
