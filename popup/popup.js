/*
 * The popup exists mainly so failure is visible. Detection rests on selectors
 * that sites change without warning, and without any UI a broken detector and
 * a genuinely idle agent look exactly the same: no dot. Here they read
 * differently.
 */
(function startPopup(globalScope) {
  "use strict";

  const { protocol, settings: settingsKit, tabTitle } = globalScope.AgentTabLights;

  // Display order and grouping. Ids must match the detector ids.
  const SITE_PROVIDERS = [
    { id: "chatgpt", name: "ChatGPT" },
    { id: "claude", name: "Claude" },
    { id: "gemini", name: "Gemini" },
    { id: "perplexity", name: "Perplexity" },
    { id: "deepseek", name: "DeepSeek" },
    { id: "mistral", name: "Le Chat" }
  ];

  const PANEL_PROVIDERS = [
    { id: "claude-code", name: "Claude Code" },
    { id: "codex", name: "Codex" },
    { id: "copilot-chat", name: "Copilot Chat" },
    { id: "generic-agent", name: "Other agent panels" }
  ];

  const elements = {
    globalToggle: document.getElementById("global-toggle"),
    dot: document.getElementById("status-dot"),
    headline: document.getElementById("status-headline"),
    detail: document.getElementById("status-detail"),
    siteList: document.getElementById("site-providers"),
    panelList: document.getElementById("panel-providers"),
    version: document.getElementById("version")
  };

  let settings = settingsKit.defaults;
  let activeTabId = null;
  let lastStatus = null;
  // Outranks the tab status until the next save succeeds, so the 1.5s refresh
  // cannot quietly wipe the one message the user needs to act on.
  let saveError = null;

  // ------------------------------------------------------------------ status

  function describe(status) {
    if (!status) {
      return {
        state: "idle",
        headline: "Not active on this tab",
        detail:
          "Open ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Le Chat, or a Codespace. If you just installed or updated, reload the tab."
      };
    }

    if (!status.enabled) {
      return {
        state: "idle",
        headline: "Turned off",
        detail: "Everything is switched off. Use the toggle above."
      };
    }

    if (status.providerEnabled === false) {
      return {
        state: "idle",
        headline: "Turned off for this site",
        detail: "Switch it back on below."
      };
    }

    const name = status.label || "This agent";
    const visual = tabTitle.visualStates[status.state] || tabTitle.visualStates.idle;

    if (status.state === "idle") {
      return {
        state: "idle",
        headline: status.observedWork ? `${name} is idle` : "Nothing happening yet",
        detail: relayDetail(status)
      };
    }

    return {
      state: status.state,
      headline: `${name} ${visual.label}`,
      detail: relayDetail(status)
    };
  }

  // The one thing a merged answer hides is whether any panel is reporting at
  // all, which is exactly the "is it broken or is it quiet" question. Only
  // asked on tabs that can host a panel in the first place.
  function relayDetail(status) {
    if (!status.expectsPanels) {
      return "";
    }

    if (!status.sources) {
      return "No agent panel detected in this tab";
    }

    return status.sources === 1 ? "via 1 panel" : `via ${status.sources} panels`;
  }

  function renderStatus(status) {
    lastStatus = status;

    const view = saveError
      ? { state: "error", headline: "Could not save that setting", detail: saveError }
      : describe(status);

    elements.dot.dataset.state = view.state;
    elements.headline.textContent = view.headline;
    elements.detail.textContent = view.detail;

    markActiveProvider(status?.detectorId || null);
  }

  function markActiveProvider(detectorId) {
    document.querySelectorAll(".provider").forEach((row) => {
      row.classList.toggle("provider--active", row.dataset.id === detectorId);
    });
  }

  async function refreshStatus() {
    if (activeTabId === null) {
      renderStatus(null);
      return;
    }

    try {
      const answer = await chrome.tabs.sendMessage(
        activeTabId,
        { type: protocol.messages.getState },
        { frameId: 0 }
      );

      renderStatus(answer?.ok ? answer : null);
    } catch {
      // "Could not establish connection": no content script on this tab,
      // either because it is unsupported or because it predates the install.
      renderStatus(null);
    }
  }

  // ---------------------------------------------------------------- settings

  function buildProviderRow(provider) {
    const row = document.createElement("li");
    row.className = "provider";
    row.dataset.id = provider.id;

    const label = document.createElement("label");
    label.className = "provider__label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = settingsKit.isEnabled(
      { enabled: true, providers: settings.providers },
      provider.id
    );
    checkbox.addEventListener("change", () => {
      setProviderEnabled(provider.id, checkbox.checked);
    });

    const name = document.createElement("span");
    name.className = "provider__name";
    name.textContent = provider.name;

    label.append(checkbox, name);
    row.append(label);

    return row;
  }

  function renderProviders() {
    elements.siteList.replaceChildren(
      ...SITE_PROVIDERS.map(buildProviderRow)
    );
    elements.panelList.replaceChildren(
      ...PANEL_PROVIDERS.map(buildProviderRow)
    );

    markActiveProvider(lastStatus?.detectorId || null);
  }

  function applyGlobalState(state = settings) {
    elements.globalToggle.checked = state.enabled;
    document.body.dataset.enabled = String(state.enabled);
  }

  async function persist(next) {
    const previous = settings;
    settings = next;

    // Sync storage has a write-rate quota. Showing the new state while it
    // silently did not save is the one outcome worth interrupting for, and the
    // controls have to go back to what is actually stored - otherwise the next
    // toggle writes the failed value alongside the new one.
    saveError = await settingsKit.save(settings);

    if (saveError) {
      settings = previous;
      applyGlobalState();
      renderProviders();
      renderStatus(lastStatus);
      return;
    }

    refreshStatus();
  }

  function setProviderEnabled(detectorId, enabled) {
    return persist(
      Object.freeze({
        enabled: settings.enabled,
        providers: Object.freeze({ ...settings.providers, [detectorId]: enabled })
      })
    );
  }

  function setGlobalEnabled(enabled) {
    applyGlobalState({ enabled, providers: settings.providers });

    return persist(Object.freeze({ enabled, providers: settings.providers }));
  }

  // -------------------------------------------------------------------- boot

  elements.globalToggle.addEventListener("change", () => {
    setGlobalEnabled(elements.globalToggle.checked);
  });

  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;

  settingsKit.load((loaded) => {
    settings = loaded;
    applyGlobalState();
    renderProviders();

    // Safe to touch now that what is on screen reflects what is stored.
    elements.globalToggle.disabled = false;
  });

  chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      activeTabId = tab?.id ?? null;
      refreshStatus();
    })
    .catch(() => renderStatus(null));

  // The dot should flip while the popup is open, not only when it is reopened.
  const poll = globalScope.setInterval(refreshStatus, 1500);
  globalScope.addEventListener("pagehide", () => globalScope.clearInterval(poll), {
    once: true
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
