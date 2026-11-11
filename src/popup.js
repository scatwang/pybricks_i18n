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
    ja: {
      subtitle: "UI・ブロックのリアルタイム言語切替",
      ready: "保存済",
      connected: "接続中",
      pillLabel: "ページ内の言語切替ピルを表示",
      safety:
        "コード完全保護：生成される MicroPython コード、変数名、.py ファイルは一切変更されません。"
    },
    de: {
      subtitle: "Live-Sprachwechsel für UI & Blöcke",
      ready: "Bereit",
      connected: "Verbunden",
      pillLabel: "Schnellumschalter auf der Seite anzeigen",
      safety:
        "Code-Schutz: Generierter MicroPython-Code, Variablen und .py-Dateien bleiben zu 100 % unverändert."
    },
    fr: {
      subtitle: "Changement de langue en direct (UI & blocs)",
      ready: "Prêt",
      connected: "Connecté",
      pillLabel: "Afficher le sélecteur rapide sur la page",
      safety:
        "Code intact : le code MicroPython généré, les variables et les fichiers .py restent 100 % inchangés."
    },
    es: {
      subtitle: "Cambio en vivo de interfaz y bloques",
      ready: "Listo",
      connected: "Conectado",
      pillLabel: "Mostrar selector rápido en página",
      safety:
        "Código intacto: el código MicroPython generado, variables y archivos .py nunca se modifican."
    },
    it: {
      subtitle: "Cambio lingua istantaneo per UI e blocchi",
      ready: "Pronto",
      connected: "Connesso",
      pillLabel: "Mostra selettore rapido nella pagina",
      safety:
        "Codice intatto: il codice MicroPython generato, le variabili e i file .py restano invariati al 100%."
    },
    nl: {
      subtitle: "Directe taalwissel voor UI & blokken",
      ready: "Gereed",
      connected: "Verbonden",
      pillLabel: "Snelle taalknop op pagina tonen",
      safety:
        "Python-code blijft 100% ongewijzigd: gegenereerde MicroPython-code, variabelen en .py-bestanden blijven intact."
    },
    pl: {
      subtitle: "Zmiana języka interfejsu i bloków na żywo",
      ready: "Gotowe",
      connected: "Połączono",
      pillLabel: "Pokaż szybki przełącznik na stronie",
      safety:
        "Ochrona kodu: generowany kod MicroPython, zmienne i pliki .py pozostają w 100% niezmienione."
    },
    cs: {
      subtitle: "Živé přepínání jazyka rozhraní a bloků",
      ready: "Připraveno",
      connected: "Připojeno",
      pillLabel: "Zobrazit rychlý přepínač na stránce",
      safety:
        "Ochrana kódu: generovaný kód MicroPython, proměnné a soubory .py zůstávají 100% beze změny."
    },
    ru: {
      subtitle: "Живое переключение языка интерфейса и блоков",
      ready: "Готово",
      connected: "Активно",
      pillLabel: "Показывать быстрый переключатель на странице",
      safety:
        "Защита кода: генерируемый код MicroPython, переменные и файлы .py остаются на 100% без изменений."
    },
    uk: {
      subtitle: "Миттєве перемикання мови інтерфейсу та блоків",
      ready: "Готово",
      connected: "Активно",
      pillLabel: "Показувати швидкий перемикач на сторінці",
      safety:
        "Захист коду: згенерований код MicroPython, змінні та файли .py залишаються на 100% незмінними."
    },
    sr: {
      subtitle: "Тренутна промена језика интерфејса и блокова",
      ready: "Спремно",
      connected: "Повезано",
      pillLabel: "Прикажи брзи прекидач на страници",
      safety:
        "Заштита кода: генерисани MicroPython код, променљиве и .py датотеке остају 100% неизмењени."
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
