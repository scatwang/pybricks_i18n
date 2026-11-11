/**
 * Pybricks Code Multi-Language Bridge (ISOLATED World @ document_start)
 *
 * Bridges `chrome.storage.sync` and toolbar Popup messages with `src/page-engine.js`
 * running in the MAIN world via DOM CustomEvents.
 */
(function () {
  "use strict";

  const BRIDGE_TO_PAGE_EVENT = "pybricks-i18n:bridge-to-page";
  const PAGE_TO_BRIDGE_EVENT = "pybricks-i18n:page-to-bridge";
  const LOCAL_STORAGE_KEY = "pybricks-locale";

  let currentLocale = readLocalPageLocale() || "en";
  let quickPillHidden = false;
  let suppressNextStorageEcho = false;

  function readLocalPageLocale() {
    try {
      return window.localStorage ? window.localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    } catch (_) {
      return null;
    }
  }

  function getStorageArea() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local || null;
    }
    return null;
  }

  function sendToPageEngine(payload) {
    try {
      window.dispatchEvent(
        new CustomEvent(BRIDGE_TO_PAGE_EVENT, {
          detail: payload
        })
      );
    } catch (_) {
      window.postMessage(
        Object.assign({ source: "pybricks-i18n-bridge" }, payload),
        "*"
      );
    }
  }

  function persistToExtensionStorage(patch) {
    const area = getStorageArea();
    if (!area) {
      return;
    }
    suppressNextStorageEcho = true;
    area.set(patch, () => {
      if (chrome.runtime && chrome.runtime.lastError && chrome.storage.local && area !== chrome.storage.local) {
        chrome.storage.local.set(patch);
      }
      setTimeout(() => {
        suppressNextStorageEcho = false;
      }, 50);
    });
  }

  // Listen for state updates emitted by `page-engine.js` in MAIN world
  window.addEventListener(PAGE_TO_BRIDGE_EVENT, (ev) => {
    const data = ev && ev.detail;
    if (!data || typeof data !== "object") {
      return;
    }
    if (typeof data.locale === "string" && data.locale) {
      const prev = currentLocale;
      currentLocale = data.locale;
      if (data.type === "LOCALE_CHANGED" && data.source !== "bridge-sync" && data.locale !== prev) {
        persistToExtensionStorage({ pybricksLocale: data.locale });
      } else if (data.type === "LOCALE_CHANGED" && data.source !== "bridge-sync") {
        persistToExtensionStorage({ pybricksLocale: data.locale });
      }
    }
    if (typeof data.quickPillHidden === "boolean") {
      quickPillHidden = data.quickPillHidden;
      if (data.type === "PILL_VISIBILITY_CHANGED") {
        persistToExtensionStorage({ quickPillHidden });
      }
    }
  });

  // Bootstrap from `chrome.storage.sync` immediately at `document_start`
  const storage = getStorageArea();
  if (storage) {
    storage.get(["pybricksLocale", "quickPillHidden"], (items) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      const hasSavedPill = items && typeof items.quickPillHidden === "boolean";
      if (hasSavedPill) {
        quickPillHidden = items.quickPillHidden;
      }

      if (items && typeof items.pybricksLocale === "string" && items.pybricksLocale) {
        currentLocale = items.pybricksLocale;
        sendToPageEngine({
          type: "SET_LOCALE",
          locale: items.pybricksLocale,
          quickPillHidden
        });
      } else {
        const pageLocale = readLocalPageLocale() || currentLocale || "en";
        currentLocale = pageLocale;
        persistToExtensionStorage({
          pybricksLocale: pageLocale,
          quickPillHidden
        });
        if (hasSavedPill) {
          sendToPageEngine({
            type: "SET_PILL_VISIBILITY",
            quickPillHidden
          });
        }
      }
    });
  }

  // Live cross-tab & popup storage listener
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" && areaName !== "local") {
        return;
      }
      if (suppressNextStorageEcho) {
        return;
      }
      const nextPayload = {};
      if (changes.quickPillHidden && typeof changes.quickPillHidden.newValue === "boolean") {
        quickPillHidden = changes.quickPillHidden.newValue;
        nextPayload.quickPillHidden = quickPillHidden;
      }
      if (changes.pybricksLocale && typeof changes.pybricksLocale.newValue === "string") {
        currentLocale = changes.pybricksLocale.newValue;
        sendToPageEngine({
          type: "SET_LOCALE",
          locale: currentLocale,
          quickPillHidden
        });
        return;
      }
      if (typeof nextPayload.quickPillHidden === "boolean") {
        sendToPageEngine({
          type: "SET_PILL_VISIBILITY",
          quickPillHidden: nextPayload.quickPillHidden
        });
      }
    });
  }

  // Direct message handler for extension toolbar Popup
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== "object") {
        return false;
      }

      if (msg.type === "PYBRICKS_I18N_GET_STATUS") {
        const liveLocale = readLocalPageLocale() || currentLocale || "en";
        currentLocale = liveLocale;
        sendResponse({
          ok: true,
          locale: liveLocale,
          quickPillHidden,
          host: window.location.host,
          url: window.location.href
        });
        return false;
      }

      if (msg.type === "PYBRICKS_I18N_SET_LOCALE" && typeof msg.locale === "string") {
        currentLocale = msg.locale;
        sendToPageEngine({
          type: "SET_LOCALE",
          locale: msg.locale,
          quickPillHidden
        });
        persistToExtensionStorage({ pybricksLocale: msg.locale });
        sendResponse({
          ok: true,
          locale: currentLocale,
          quickPillHidden
        });
        return false;
      }

      if (msg.type === "PYBRICKS_I18N_SET_PILL" && typeof msg.quickPillHidden === "boolean") {
        quickPillHidden = msg.quickPillHidden;
        sendToPageEngine({
          type: "SET_PILL_VISIBILITY",
          quickPillHidden
        });
        persistToExtensionStorage({ quickPillHidden });
        sendResponse({
          ok: true,
          locale: currentLocale,
          quickPillHidden
        });
        return false;
      }

      return false;
    });
  }
})();
