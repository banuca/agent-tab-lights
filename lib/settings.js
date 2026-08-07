(function attachSettings(globalScope) {
  "use strict";

  const storageKey = "settings";

  /*
   * User preferences, shared by the content scripts and the popup.
   *
   * One rule holds the whole design together: absent means enabled. Nothing
   * ever seeds storage, so there is no onInstalled handler, no migration, and
   * no first-run write - and a provider added in a later version is on by
   * default for everyone without touching their stored settings.
   */
  const defaults = Object.freeze({
    enabled: true,
    providers: Object.freeze({})
  });

  function resolve(raw) {
    const stored = raw?.[storageKey] || {};

    return Object.freeze({
      enabled: stored.enabled !== false,
      providers: Object.freeze({ ...(stored.providers || {}) })
    });
  }

  function isEnabled(settings, detectorId) {
    if (!settings?.enabled) {
      return false;
    }

    if (!detectorId) {
      return true;
    }

    return settings.providers?.[detectorId] !== false;
  }

  function area() {
    return globalScope.chrome?.storage?.sync || null;
  }

  /**
   * Reads settings once. Feature-detects storage so this works before the
   * permission exists, and in tests: with no storage everything is enabled.
   */
  function load(callback) {
    const storage = area();

    if (!storage) {
      callback(defaults);
      return;
    }

    // Chrome ignores the callback if you use the promise form and vice versa,
    // but shims differ; answer once whichever arrives first.
    let answered = false;

    function answer(value) {
      if (answered) {
        return;
      }

      answered = true;
      callback(value);
    }

    try {
      const result = storage.get(storageKey, (value) => {
        answer(resolve(value));
      });

      if (result && typeof result.then === "function") {
        result
          .then((value) => answer(resolve(value)))
          .catch(() => answer(defaults));
      }
    } catch {
      answer(defaults);
    }
  }

  function subscribe(callback) {
    const onChanged = globalScope.chrome?.storage?.onChanged;

    if (!onChanged) {
      return () => {};
    }

    const listener = (changes, areaName) => {
      if (areaName !== "sync" || !changes[storageKey]) {
        return;
      }

      callback(resolve({ [storageKey]: changes[storageKey].newValue }));
    };

    onChanged.addListener(listener);

    return () => onChanged.removeListener(listener);
  }

  /**
   * Resolves with an error message if the write failed, or null if it landed.
   * Sync storage has a write-rate quota, and a silent failure would leave the
   * popup showing a preference that was never saved.
   */
  function save(settings) {
    const storage = area();

    if (!storage) {
      return Promise.resolve(null);
    }

    return new Promise((resolveSave) => {
      let settled = false;

      function finish(error) {
        if (!settled) {
          settled = true;
          resolveSave(error || null);
        }
      }

      const result = storage.set(
        {
          [storageKey]: {
            enabled: settings.enabled !== false,
            providers: { ...(settings.providers || {}) }
          }
        },
        () => finish(globalScope.chrome?.runtime?.lastError?.message)
      );

      if (result && typeof result.then === "function") {
        result.then(() => finish(null)).catch((error) => finish(String(error)));
      }
    });
  }

  const settings = Object.freeze({
    storageKey,
    defaults,
    resolve,
    isEnabled,
    load,
    subscribe,
    save
  });

  const namespace = (globalScope.AgentTabLights = globalScope.AgentTabLights || {});
  namespace.settings = settings;

  if (typeof module === "object" && module.exports) {
    module.exports = settings;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
