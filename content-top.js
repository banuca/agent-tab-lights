/*
 * Runs in the top frame and owns the tab title. Thin wiring only - the pipeline
 * lives in lib/tab-controller.js so it can be tested without a browser.
 *
 * The tab's state is the merge of two sources, either of which may be absent:
 *
 *   local  - the agent UI is in this document (chatgpt.com, claude.ai, and the
 *            Copilot Chat view in the VS Code workbench).
 *   relay  - the agent UI is in a sandboxed webview iframe we cannot read from
 *            here, so state arrives from the service worker.
 *
 * A Codespace can have both at once, which is why they merge rather than branch.
 */
(function startTabLights(globalScope) {
  "use strict";

  const namespace = globalScope.AgentTabLights;
  const protocol = namespace?.protocol;
  const tabTitleKit = namespace?.tabTitle;
  const stateMachineKit = namespace?.stateMachine;
  const controllerKit = namespace?.tabController;
  const kit = namespace?.kit;
  const watcherKit = namespace?.watcher;
  const settingsKit = namespace?.settings;

  if (!protocol || !tabTitleKit || !stateMachineKit || !controllerKit) {
    return;
  }

  if (globalScope !== globalScope.top) {
    return;
  }

  // Read lazily: the detector files register themselves into the same
  // namespace, and depending on manifest ordering they may not all have run
  // when this file is evaluated.
  const getDetectors = () => namespace.detectors || {};

  const hostname = globalScope.location.hostname.replace(/^www\./, "");

  // Which detector owns this host comes from the detector profiles themselves.
  // A separate host table here used to be a fourth place to edit when adding a
  // provider, and forgetting it failed silently.
  const localDetector = kit?.findLocalDetector(getDetectors(), hostname) || null;

  let settings = settingsKit?.defaults;

  const controller = controllerKit.createTabController({
    protocol,
    document,
    globalScope,
    tabTitleKit,
    stateMachineKit,
    getDetectors,
    localDetector,
    now: () => performance.now(),
    createWatcher: localDetector ? watcherKit?.createWatcher : null,
    isProviderEnabled: (detectorId) =>
      settingsKit ? settingsKit.isEnabled(settings, detectorId) : true,
    // frame-reporter is only loaded on the hosts that can contain agent panels,
    // so its presence is what tells this tab whether to expect any.
    expectsPanels: Boolean(namespace.frameReporter)
  });

  function applySettings(loaded) {
    settings = loaded;

    // The two switches are applied separately. The master switch silences the
    // whole tab; a per-provider switch only removes the local detector from the
    // merge, because a workbench tab's local detector (Copilot Chat) shares the
    // tab with relayed panels that have their own toggles.
    controller.setEnabled(settingsKit.isEnabled(settings, null));
    controller.refreshProviders();
  }

  settingsKit?.load(applySettings);
  settingsKit?.subscribe(applySettings);

  // Not {once:true}: a bfcache restore brings the page back and the next
  // pagehide has to tear down again.
  globalScope.addEventListener("pagehide", () => controller.dispose());

  // Restored from the back/forward cache: the watcher stopped on pagehide and
  // nothing would have restarted it.
  globalScope.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      controller.resume();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      controller.resume();
    }
  });

  controller.start();
})(typeof globalThis !== "undefined" ? globalThis : this);
