/**
 * Pybricks Code Multi-Language Toolbar Popup Controller
 *
 * Syncs instant language selection & floating quick-pill visibility with
 * `chrome.storage.sync` and any active `code.pybricks.com` / `beta.pybricks.com` tab.
 */
(function () {
  "use strict";

  const POPUP_COPY = {
    en: {
      subtitle: "UI & Blockly Live Switcher",
      ready: "Saved",
      connected: "Live",
      pillLabel: "Show in-page quick switcher",
      safety:
        "Zero-Code-Mutation: Generated MicroPython code, variables, and .py files are 100% untouched."
    },
    "zh-CN": {
      subtitle: "界面与积木免刷新实时切换",
      ready: "已就绪",
      connected: "已连接",
      pillLabel: "显示页面快捷切换胶囊",
      safety: "零代码污染保证：底层 MicroPython 源码、变量名与 .py 文件保持 100% 原样不变。"
    },
    "zh-TW": {
      subtitle: "介面與積木免刷新即時切換",
      ready: "已就緒",
      connected: "已連線",
      pillLabel: "顯示頁面快捷切換膠囊",
      safety: "零程式碼污染保證：底層 MicroPython 原始碼、變數名與 .py 檔案保持 100% 原樣不變。"
    },
    es: {
      subtitle: "Cambio en vivo de interfaz y bloques",
      ready: "Listo",
      connected: "Conectado",
      pillLabel: "Mostrar selector rápido en página",
      safety:
        "Código intacto: el código MicroPython generado, variables y archivos .py nunca se modifican."
    },
    nl: {
      subtitle: "Directe taalwissel voor UI & blokken",
      ready: "Gereed",
      connected: "Verbonden",
      pillLabel: "Snelle taalknop op pagina tonen",
      safety:
        "Python-code blijft 100% ongewijzigd: gegenereerde MicroPython-code, variabelen en .py-bestanden blijven intact."
    }
  };

  const cards = Array.from(document.querySelectorAll(".lang-card[data-locale]"));
  const pillCheckbox = document.getElementById("toggle-pill");
  const statusBadge = document.getElementById("status-badge");
  const subtitleEl = document.getElementById("ui-subtitle");
  const pillLabelEl = document.getElementById("ui-pill-label");
  const safetyEl = document.getElementById("ui-safety");

  let activeLocale = "en";
  let activePybricksTabId = null;

  function getStorageArea() {
    if (typeof chrome !== "undefined" && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local || null;
    }
    return null;
  }

  function isPybricksUrl(url) {
    return (
      typeof url === "string" &&
      (url.startsWith("https://code.pybricks.com/") ||
        url.startsWith("https://beta.pybricks.com/"))
    );
  }

  function renderUI(locale, quickPillHidden) {
    activeLocale = POPUP_COPY[locale] ? locale : "en";
    const copy = POPUP_COPY[activeLocale];

    for (const card of cards) {
      const isSelected = card.getAttribute("data-locale") === activeLocale;
      card.classList.toggle("active", isSelected);
      card.setAttribute("aria-checked", String(isSelected));
    }

    if (typeof quickPillHidden === "boolean") {
      pillCheckbox.checked = !quickPillHidden;
    }

    subtitleEl.textContent = copy.subtitle;
    pillLabelEl.textContent = copy.pillLabel;
    safetyEl.textContent = copy.safety;

    if (activePybricksTabId !== null) {
      statusBadge.textContent = copy.connected;
      statusBadge.classList.add("connected");
    } else {
      statusBadge.textContent = copy.ready;
      statusBadge.classList.remove("connected");
    }
  }

  function saveStorage(patch) {
    const storage = getStorageArea();
    if (!storage) {
      return;
    }
    storage.set(patch, () => {
      if (chrome.runtime && chrome.runtime.lastError && chrome.storage.local && storage !== chrome.storage.local) {
        chrome.storage.local.set(patch);
      }
    });
  }

  function selectLocale(locale) {
    renderUI(locale, undefined);
    saveStorage({ pybricksLocale: locale });

    if (activePybricksTabId !== null && chrome.tabs && chrome.tabs.sendMessage) {
      chrome.tabs.sendMessage(
        activePybricksTabId,
        { type: "PYBRICKS_I18N_SET_LOCALE", locale },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
  }

  function togglePillVisibility(showPill) {
    const quickPillHidden = !showPill;
    saveStorage({ quickPillHidden });

    if (activePybricksTabId !== null && chrome.tabs && chrome.tabs.sendMessage) {
      chrome.tabs.sendMessage(
        activePybricksTabId,
        { type: "PYBRICKS_I18N_SET_PILL", quickPillHidden },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
  }

  for (const card of cards) {
    card.addEventListener("click", () => {
      selectLocale(card.getAttribute("data-locale"));
    });
  }

  pillCheckbox.addEventListener("change", () => {
    togglePillVisibility(pillCheckbox.checked);
  });

  // Initialize state from storage + active Pybricks tab
  const storage = getStorageArea();
  if (storage) {
    storage.get(["pybricksLocale", "quickPillHidden"], (items) => {
      const savedLoc =
        items && typeof items.pybricksLocale === "string" ? items.pybricksLocale : "en";
      const hidden = Boolean(items && items.quickPillHidden);
      renderUI(savedLoc, hidden);
    });
  } else {
    renderUI("en", false);
  }

  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id || (!isPybricksUrl(tab.url) && tab.url !== undefined)) {
        // Still try messaging in case activeTab host_permissions match without `tabs` permission exposing `tab.url`
        if (!tab || !tab.id || tab.url) {
          return;
        }
      }
      chrome.tabs.sendMessage(
        tab.id,
        { type: "PYBRICKS_I18N_GET_STATUS" },
        (resp) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            return;
          }
          if (resp && resp.ok) {
            activePybricksTabId = tab.id;
            renderUI(resp.locale || activeLocale, resp.quickPillHidden);
          }
        }
      );
    });
  }
})();
