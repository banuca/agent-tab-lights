/*
 * Agent Tab Lights - DOM capture helper
 *
 * Paste this whole file into the DevTools console to find out which DOM
 * signals a provider exposes. The output is what the detector profiles in
 * detectors/ are built from.
 *
 * For a VS Code panel (Claude Code, Codex) the panel lives in a sandboxed
 * iframe, so switch the console context dropdown from "top" to the webview
 * frame before pasting. If the frame list is ambiguous, paste into each
 * candidate: the wrong frame reports 0 interesting elements.
 *
 * Usage:
 *   AgentTabLightsCapture.snapshot()   one-off dump of the current DOM
 *   AgentTabLightsCapture.record(60)   log every change for 60 seconds
 *   AgentTabLightsCapture.stop()       end an early recording
 *   AgentTabLightsCapture.copy()       copy the full transcript as JSON
 *
 * Record, then drive one full cycle: send a slow prompt, let it finish, trigger
 * an approval prompt, and force an error. The transitions matter far more than
 * any single snapshot.
 */
(function installCapture(globalScope) {
  "use strict";

  // A deliberately wide net. We are looking for candidates here, not deciding
  // anything, so precision comes later once we can see what actually exists.
  const probes = Object.freeze([
    "[aria-busy]",
    '[role="status"]',
    "[aria-live]",
    '[role="alert"]',
    '[role="dialog"]',
    "[data-testid]",
    "button",
    '[role="button"]',
    "[aria-label]",
    "[title]"
  ]);

  const textLimit = 120;
  const perProbeLimit = 40;

  function normalise(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, textLimit);
  }

  function isVisible(element) {
    if (element.hidden || element.disabled) {
      return false;
    }

    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (element.closest('[hidden], [aria-hidden="true"], [inert]')) {
      return false;
    }

    // Detectors run on attributes alone, but for capture we also want to know
    // whether a match is actually on screen, since CSS-hidden controls are a
    // common source of false positives.
    const box = element.getBoundingClientRect?.();
    return !box || box.width > 0 || box.height > 0;
  }

  function describe(element) {
    const record = {
      tag: element.tagName?.toLowerCase() || "?",
      visible: isVisible(element)
    };

    const interesting = [
      "data-testid",
      "aria-label",
      "aria-busy",
      "aria-live",
      "role",
      "title",
      "disabled",
      "class"
    ];

    for (const name of interesting) {
      const value = element.getAttribute?.(name);

      if (value !== null && value !== undefined && value !== "") {
        // Class lists in these apps are enormous and mostly Tailwind noise.
        record[name] = name === "class" ? normalise(value).slice(0, 60) : normalise(value);
      }
    }

    const text = normalise(element.textContent);

    if (text) {
      record.text = text;
    }

    return record;
  }

  function snapshot({ quiet = false } = {}) {
    const frame = {
      href: location.href,
      origin: location.origin,
      isTopFrame: globalScope === globalScope.top,
      // Resolves the open question of which origin a Codespaces webview uses.
      ancestorOrigins: Array.from(location.ancestorOrigins || []),
      title: document.title,
      capturedAt: new Date().toISOString()
    };

    const found = {};

    for (const probe of probes) {
      let elements;

      try {
        elements = Array.from(document.querySelectorAll(probe));
      } catch {
        continue;
      }

      const described = elements.map(describe).filter((entry) => entry.visible);

      if (described.length) {
        found[probe] = {
          total: described.length,
          samples: described.slice(0, perProbeLimit)
        };
      }
    }

    const result = { frame, found };

    if (!quiet) {
      console.log("%c[agent-tab-lights] frame", "font-weight:bold", frame);
      console.log("[agent-tab-lights] signals", found);
      console.log(
        "[agent-tab-lights] run AgentTabLightsCapture.record(60) and drive a full prompt cycle, then .copy()"
      );
    }

    return result;
  }

  const transcript = [];
  let observer = null;
  let poll = null;
  let stopTimer = null;

  // Only the fields a detector could plausibly key on. Comparing whole
  // snapshots would flag every token of streamed text as a change.
  function fingerprint(state) {
    const parts = [];

    for (const [probe, group] of Object.entries(state.found)) {
      for (const sample of group.samples) {
        parts.push(
          [
            probe,
            sample.tag,
            sample["data-testid"] || "",
            sample["aria-label"] || "",
            sample["aria-busy"] || "",
            sample.role || "",
            (sample.text || "").slice(0, 40)
          ].join("|")
        );
      }
    }

    return parts.sort().join("\n");
  }

  let lastFingerprint = "";

  function tick(reason) {
    const state = snapshot({ quiet: true });
    const current = fingerprint(state);

    if (current === lastFingerprint) {
      return;
    }

    lastFingerprint = current;
    state.reason = reason;
    state.title = document.title;
    transcript.push(state);

    console.log(
      `%c[agent-tab-lights] change #${transcript.length} (${reason})`,
      "color:#c60",
      state.found
    );
  }

  function stop() {
    observer?.disconnect();
    observer = null;

    if (poll !== null) {
      clearInterval(poll);
      poll = null;
    }

    if (stopTimer !== null) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }

    console.log(
      `%c[agent-tab-lights] recording stopped, ${transcript.length} change(s) captured. Run AgentTabLightsCapture.copy()`,
      "font-weight:bold"
    );

    return transcript;
  }

  function record(seconds = 60) {
    stop();
    transcript.length = 0;
    lastFingerprint = "";

    tick("initial");

    observer = new MutationObserver(() => tick("mutation"));
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    });

    // Catches state changes that are CSS-only, which mutations can miss.
    poll = setInterval(() => tick("poll"), 1000);
    stopTimer = setTimeout(stop, seconds * 1000);

    console.log(
      `%c[agent-tab-lights] recording for ${seconds}s - now send a slow prompt, let it finish, then trigger an approval and an error`,
      "font-weight:bold"
    );
  }

  function copy() {
    const payload = JSON.stringify(transcript, null, 2);

    if (typeof globalScope.copy === "function") {
      globalScope.copy(payload);
      console.log("[agent-tab-lights] transcript copied to clipboard");
    } else {
      console.log(payload);
    }

    return payload;
  }

  globalScope.AgentTabLightsCapture = { snapshot, record, stop, copy, transcript, probes };

  console.log(
    "%c[agent-tab-lights] capture ready",
    "font-weight:bold;color:#080",
    "-> AgentTabLightsCapture.snapshot() or .record(60)"
  );

  snapshot();
})(typeof globalThis !== "undefined" ? globalThis : this);
