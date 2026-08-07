"use strict";

/*
 * A stand-in for the slice of the extension API this codebase actually uses:
 * runtime messaging (callback form, with lastError), tabs messaging (promise
 * form), storage.sync, and the tab lifecycle events.
 *
 * The scenario knobs matter as much as the API surface. Two failure modes have
 * bitten this extension and both need to be reproducible in tests:
 *
 *   makeOrphaned()  - the extension was reloaded, so runtime.id disappears and
 *                     every send is permanently futile.
 *   failNextSend()  - a transient delivery failure (no receiver yet), which
 *                     surfaces via lastError and must NOT be treated as fatal.
 */

const { createEventEmitter } = require("./fake-browser.js");

function createListenerSlot() {
  const listeners = [];

  return {
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);

      if (index !== -1) {
        listeners.splice(index, 1);
      }
    },
    hasListener(listener) {
      return listeners.includes(listener);
    },
    emit(...args) {
      return listeners.map((listener) => listener(...args));
    },
    get count() {
      return listeners.length;
    }
  };
}

function createFakeChrome({ manifestVersion = "0.3.0" } = {}) {
  const runtimeMessages = [];
  const tabMessages = [];
  const storageValues = {};
  const storageChanged = createListenerSlot();
  const runtimeOnMessage = createListenerSlot();
  const tabsOnRemoved = createListenerSlot();
  const tabsOnUpdated = createListenerSlot();
  const events = createEventEmitter();

  let pendingSendError = null;
  let tabSendRejection = null;

  const chrome = {
    runtime: {
      id: "fake-extension-id",
      lastError: null,
      getManifest: () => ({ version: manifestVersion }),
      sendMessage(message, callback) {
        runtimeMessages.push(message);

        const error = pendingSendError;
        pendingSendError = null;

        if (typeof callback === "function") {
          chrome.runtime.lastError = error ? { message: error } : null;
          callback(undefined);
          chrome.runtime.lastError = null;
        }
      },
      onMessage: runtimeOnMessage
    },
    tabs: {
      query: async () => [{ id: 1, active: true }],
      sendMessage(tabId, message, options) {
        tabMessages.push({ tabId, message, options });

        if (tabSendRejection) {
          const reason = tabSendRejection;
          tabSendRejection = null;
          return Promise.reject(new Error(reason));
        }

        return Promise.resolve(undefined);
      },
      onRemoved: tabsOnRemoved,
      onUpdated: tabsOnUpdated
    },
    storage: {
      sync: {
        get(request, callback) {
          const keys =
            typeof request === "string"
              ? [request]
              : Array.isArray(request)
                ? request
                : Object.keys(request || {});
          const result = {};

          keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(storageValues, key)) {
              result[key] = storageValues[key];
            }
          });

          if (typeof callback === "function") {
            callback(result);
            return undefined;
          }

          return Promise.resolve(result);
        },
        set(items, callback) {
          const changes = {};

          Object.entries(items).forEach(([key, value]) => {
            changes[key] = { oldValue: storageValues[key], newValue: value };
            storageValues[key] = value;
          });

          storageChanged.emit(changes, "sync");

          if (typeof callback === "function") {
            callback();
            return undefined;
          }

          return Promise.resolve();
        }
      },
      onChanged: storageChanged
    },

    // Test-only handles.
    _runtimeMessages: runtimeMessages,
    _tabMessages: tabMessages,
    _storageValues: storageValues,
    _events: events,
    makeOrphaned() {
      chrome.runtime.id = undefined;
    },
    makeSendThrow() {
      chrome.runtime.sendMessage = () => {
        throw new Error("Extension context invalidated.");
      };
    },
    failNextSend(message = "Could not establish connection.") {
      pendingSendError = message;
    },
    failNextTabSend(message = "Could not establish connection.") {
      tabSendRejection = message;
    },
    seedStorage(values) {
      Object.assign(storageValues, values);
    }
  };

  return chrome;
}

module.exports = { createFakeChrome, createListenerSlot };
