/**
 * Pybricks Code Multi-Language Engine (MAIN World @ document_start)
 *
 * Implements the 4-layer zero-intrusion architecture specified in DESIGN.md:
 *   Layer 1: @shopify/react-i18n Map.prototype.set interception & Fiber live hot-switch
 *   Layer 2: Blockly v10 & Pybricks custom blocks AST-safe 6-hook interception
 *   Layer 3: Strict-whitelist DOM micro-patches + native Settings selector & quick pill
 *   Layer 4: Zero-Code-Mutation firewall (Python code, Monaco, REPL, filenames untouched)
 */
(function (root) {
  "use strict";

  if (root.__PYBRICKS_I18N_ENGINE__) {
    return;
  }

  const STORAGE_KEY = "pybricks-locale";
  const PILL_COLLAPSED_KEY = "pybricks-i18n-pill-collapsed";
  const BRIDGE_TO_PAGE_EVENT = "pybricks-i18n:bridge-to-page";
  const PAGE_TO_BRIDGE_EVENT = "pybricks-i18n:page-to-bridge";

  const SUPPORTED_LOCALES = root.__PYBRICKS_I18N_SUPPORTED_LOCALES__ || [
    { code: "en", label: "English", nativeLabel: "English", short: "EN" },
    { code: "zh-CN", label: "Simplified Chinese", nativeLabel: "简体中文", short: "简中" },
    { code: "zh-TW", label: "Traditional Chinese", nativeLabel: "繁體中文", short: "繁中" },
    { code: "ja", label: "Japanese", nativeLabel: "日本語", short: "JA" },
    { code: "de", label: "German", nativeLabel: "Deutsch", short: "DE" },
    { code: "fr", label: "French", nativeLabel: "Français", short: "FR" },
    { code: "es", label: "Spanish", nativeLabel: "Español", short: "ES" },
    { code: "it", label: "Italian", nativeLabel: "Italiano", short: "IT" },
    { code: "nl", label: "Dutch", nativeLabel: "Nederlands", short: "NL" },
    { code: "pl", label: "Polish", nativeLabel: "Polski", short: "PL" },
    { code: "cs", label: "Czech", nativeLabel: "Čeština", short: "CS" },
    { code: "ru", label: "Russian", nativeLabel: "Русский", short: "RU" },
    { code: "uk", label: "Ukrainian", nativeLabel: "Українська", short: "UK" },
    { code: "sr", label: "Serbian", nativeLabel: "Српски", short: "SR" }
  ];
  const SUPPORTED_CODES = new Set(SUPPORTED_LOCALES.map((item) => item.code));
  const UI_STRINGS_LOCALES = root.__PYBRICKS_I18N_UI_STRINGS_LOCALES__ || [
    "zh-CN",
    "zh-TW",
    "ja",
    "de",
    "fr",
    "es",
    "it",
    "nl",
    "pl",
    "cs",
    "ru",
    "uk",
    "sr"
  ];
  const LANG_INDEX = Object.fromEntries(
    UI_STRINGS_LOCALES.map((loc, idx) => [loc, idx])
  );

  const UI_CATALOG = root.__PYBRICKS_I18N_UI_CATALOG__ || {};
  const UI_STRINGS = root.__PYBRICKS_I18N_UI_STRINGS__ || {};
  const UI_OVERRIDES = root.__PYBRICKS_I18N_UI_OVERRIDES__ || {};
  const DOM_PATCHES = root.__PYBRICKS_I18N_DOM_PATCHES__ || {};

  const BKY_STD = root.__PYBRICKS_I18N_BKY_STD__ || {};
  const BKY_CUSTOM = root.__PYBRICKS_I18N_BKY_CUSTOM__ || {};
  const MESSAGE0_UPGRADES = root.__PYBRICKS_I18N_MESSAGE0_UPGRADES__ || {};
  const FIELD_LABELS = root.__PYBRICKS_I18N_FIELD_LABELS__ || {};
  const TOOLBOX_CATEGORIES = root.__PYBRICKS_I18N_TOOLBOX_CATEGORIES__ || {};
  const FLYOUT_LABELS = root.__PYBRICKS_I18N_FLYOUT_LABELS__ || {};

  // Reverse lookup from any localized FieldLabel text back to its PB_EXT_* key
  const REVERSE_FIELD_LABELS = Object.create(null);
  for (const [enLabel, msgKey] of Object.entries(FIELD_LABELS)) {
    REVERSE_FIELD_LABELS[enLabel] = msgKey;
    for (const loc of Object.keys(BKY_CUSTOM)) {
      const translated = BKY_CUSTOM[loc] && BKY_CUSTOM[loc][msgKey];
      if (typeof translated === "string" && translated.length > 0) {
        REVERSE_FIELD_LABELS[translated] = msgKey;
      }
    }
  }

  // Layer 4: Strict subtree blacklist — never inspect or mutate any node inside these zones
  const BLACKLIST_SELECTOR = [
    ".monaco-editor",
    ".pb-editor-monaco",
    ".xterm",
    ".pb-terminal",
    ".rct-tree-items-container",
    ".rct-tree-item-button",
    ".blocklyEditableText",
    "code",
    "pre",
    "textarea"
  ].join(", ");

  // Empty C-shaped block labels enforced by Pybricks (`gs` in 4852.js)
  const EMPTY_C_BLOCK_KEYS = ["CONTROLS_REPEAT_INPUT_DO", "CONTROLS_IF_MSG_THEN"];

  // Protected universal math/logic/separator symbols (`Ss` in 4852.js — 34 entries)
  const PROTECTED_OPERATOR_SYMBOLS = {
    GTE: "\u2265",
    LTE: "\u2264",
    NEQ: "\u2260",
    GT: ">",
    LT: "<",
    EQ: "==",
    SIN: "sin",
    COS: "cos",
    TAN: "tan",
    ASIN: "asin",
    ACOS: "acos",
    ATAN: "atan",
    ATAN2: "atan2",
    ROOT: "\u221a",
    ABS: "abs",
    NEG: "\u2212",
    LN: "ln",
    LOG10: "log10",
    EXP: "e^",
    POW10: "10^",
    MIN: "min",
    MAX: "max",
    ROUND: "round",
    ROUNDUP: "ceil",
    ROUNDDOWN: "floor",
    MODULO: "mod",
    ADD: "+",
    MINUS: "\u2212",
    MULTIPLY: "\u00d7",
    DIVIDE: "\u00f7",
    POWER: "^",
    SEP_COMMA_ONLY: ",",
    SEP_COMMA_SPACE: ", ",
    SEP_SPACE: " "
  };

  /**
   * Normalize arbitrary BCP-47 locale tags (e.g. "zh", "zh-Hans-CN", "zh-TW", "ja-JP", "de-AT", "es-419")
   * to one of the 14 supported canonical locale codes.
   */
  function normalizeLocale(raw) {
    if (typeof raw !== "string" || !raw.trim()) {
      return null;
    }
    const clean = raw.trim();
    if (SUPPORTED_CODES.has(clean)) {
      return clean;
    }
    const lower = clean.toLowerCase().replace(/_/g, "-");
    if (
      lower === "zh-tw" ||
      lower === "zh-hk" ||
      lower === "zh-mo" ||
      lower.startsWith("zh-hant")
    ) {
      return "zh-TW";
    }
    if (lower === "zh" || lower.startsWith("zh-")) {
      return "zh-CN";
    }
    const primary = lower.split("-")[0];
    if (SUPPORTED_CODES.has(primary)) {
      return primary;
    }
    return null;
  }

  /**
   * Return BCP-47 lookup subtags matching Pybricks internal `cM(locale)` behavior.
   * For "zh-CN", `cM("zh-CN")` checks both "zh-CN" and "zh".
   */
  function getLocaleSubtags(locale) {
    const parts = String(locale).split("-");
    if (parts.length > 1) {
      return [`${parts[0]}-${parts[1].toUpperCase()}`, parts[0]];
    }
    return [locale];
  }

  function safeGetStorage(key) {
    try {
      return root.localStorage ? root.localStorage.getItem(key) : null;
    } catch (_) {
      return null;
    }
  }

  function safeSetStorage(key, value) {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(key, value);
      }
    } catch (_) {
      // Ignore storage quota/sandbox errors
    }
  }

  function detectInitialLocale() {
    const stored = safeGetStorage(STORAGE_KEY);
    if (stored === "pseudolocalize") {
      return "en";
    }
    const normalizedStored = normalizeLocale(stored);
    if (normalizedStored) {
      if (stored !== normalizedStored) {
        safeSetStorage(STORAGE_KEY, normalizedStored);
      }
      return normalizedStored;
    }

    const navCandidates = [];
    if (root.navigator) {
      if (Array.isArray(root.navigator.languages)) {
        navCandidates.push(...root.navigator.languages);
      }
      if (root.navigator.language) {
        navCandidates.push(root.navigator.language);
      }
    }
    for (const candidate of navCandidates) {
      const matched = normalizeLocale(candidate);
      if (matched) {
        safeSetStorage(STORAGE_KEY, matched);
        return matched;
      }
    }

    safeSetStorage(STORAGE_KEY, "en");
    return "en";
  }

  let currentLocale = detectInitialLocale();
  let quickPillHidden = false;
  let quickPillCollapsed = safeGetStorage(PILL_COLLAPSED_KEY) === "1";

  function syncDocumentLang(locale) {
    try {
      if (root.document && root.document.documentElement) {
        root.document.documentElement.setAttribute("lang", locale);
        root.document.documentElement.setAttribute("data-pybricks-i18n-locale", locale);
      }
    } catch (_) {
      // Ignore early document_start edge cases
    }
  }
  syncDocumentLang(currentLocale);

  // ============================================================================
  // LAYER 1: @shopify/react-i18n Interception & Live Hot-Switch
  // ============================================================================

  const recordedFallbacks = new Map(); // modId -> English fallback tree
  const knownModuleIds = new Set(Object.keys(UI_CATALOG.en || {}));
  const synthesizedTreeCache = new Map(); // `${modId}__${locale}` -> translated tree
  let translationsMapRef = null;
  let fallbacksMapRef = null;
  let i18nManagerRef = null;

  const origMapSet = Map.prototype.set;

  /**
   * Recursively synthesize a translated dictionary tree from an English fallback tree,
   * preferring pre-compiled module catalog entries, then path overrides, then string map.
   */
  function synthesizeTranslationNode(fallbackNode, catalogNode, fullPath, langIdx) {
    if (typeof fallbackNode === "string") {
      if (typeof catalogNode === "string" && catalogNode.length > 0) {
        return catalogNode;
      }
      const override = UI_OVERRIDES[fullPath];
      if (Array.isArray(override) && typeof override[langIdx] === "string") {
        return override[langIdx];
      }
      const mapped = UI_STRINGS[fallbackNode];
      if (Array.isArray(mapped) && typeof mapped[langIdx] === "string") {
        return mapped[langIdx];
      }
      return fallbackNode;
    }

    if (Array.isArray(fallbackNode)) {
      return fallbackNode.map((item, idx) =>
        synthesizeTranslationNode(
          item,
          Array.isArray(catalogNode) ? catalogNode[idx] : undefined,
          `${fullPath}.${idx}`,
          langIdx
        )
      );
    }

    if (fallbackNode && typeof fallbackNode === "object") {
      const out = {};
      const catObj = catalogNode && typeof catalogNode === "object" ? catalogNode : null;
      for (const key of Object.keys(fallbackNode)) {
        const nextPath = fullPath ? `${fullPath}.${key}` : key;
        out[key] = synthesizeTranslationNode(
          fallbackNode[key],
          catObj ? catObj[key] : undefined,
          nextPath,
          langIdx
        );
      }
      return out;
    }

    return fallbackNode;
  }

  function getModuleTranslation(modId, targetLocale) {
    const normLoc = normalizeLocale(targetLocale);
    if (!normLoc) {
      return undefined;
    }

    const fallbackTree = recordedFallbacks.get(modId);
    if (normLoc === "en") {
      return fallbackTree || (UI_CATALOG.en && UI_CATALOG.en[modId]);
    }

    const cacheKey = `${modId}__${normLoc}`;
    if (synthesizedTreeCache.has(cacheKey)) {
      return synthesizedTreeCache.get(cacheKey);
    }

    const catalogTree = UI_CATALOG[normLoc] && UI_CATALOG[normLoc][modId];
    const langIdx = LANG_INDEX[normLoc];

    let resultTree;
    if (fallbackTree && typeof langIdx === "number") {
      resultTree = synthesizeTranslationNode(fallbackTree, catalogTree, modId, langIdx);
    } else if (catalogTree) {
      resultTree = catalogTree;
    }

    if (resultTree !== undefined) {
      origMapSet.call(synthesizedTreeCache, cacheKey, resultTree);
    }
    return resultTree;
  }

  function invalidateModuleCache(modId) {
    for (const loc of SUPPORTED_CODES) {
      synthesizedTreeCache.delete(`${modId}__${loc}`);
    }
  }

  // Ultra-lightweight prefix guard on Map.prototype.set (only touches external "i18n_*" keys)
  Map.prototype.set = function (key, value) {
    if (
      this !== recordedFallbacks &&
      this !== synthesizedTreeCache &&
      typeof key === "string" &&
      key.length > 5 &&
      key.charCodeAt(0) === 105 &&
      key.startsWith("i18n_")
    ) {
      const sepIdx = key.indexOf("__");
      if (sepIdx === -1) {
        // `pM.fallbacks.set("i18n_<hash>", englishFallback)`
        if (value && typeof value === "object") {
          fallbacksMapRef = this;
          knownModuleIds.add(key);
          if (recordedFallbacks.get(key) !== value) {
            origMapSet.call(recordedFallbacks, key, value);
            invalidateModuleCache(key);
          }
        }
        return origMapSet.call(this, key, value);
      }

      // `pM.translations.set("i18n_<hash>__<locale>", maybeUndefined)`
      translationsMapRef = this;
      const modId = key.slice(0, sepIdx);
      const rawSubtag = key.slice(sepIdx + 2);
      knownModuleIds.add(modId);

      if (value === undefined || value === null) {
        const normLoc = normalizeLocale(rawSubtag);
        if (normLoc) {
          const translatedTree = getModuleTranslation(modId, normLoc);
          if (translatedTree !== undefined) {
            return origMapSet.call(this, key, translatedTree);
          }
        }
      }
    }
    return origMapSet.call(this, key, value);
  };

  /**
   * Populate all registered/known i18n_* modules for `locale` (and its BCP-47 subtags)
   * into the target translations Map.
   */
  function populateTranslationsMap(targetMap, locale) {
    if (!(targetMap instanceof Map)) {
      return 0;
    }
    const subtags = getLocaleSubtags(locale);
    let count = 0;
    for (const modId of knownModuleIds) {
      const tree = getModuleTranslation(modId, locale);
      if (tree !== undefined) {
        for (const sub of subtags) {
          origMapSet.call(targetMap, `${modId}__${sub}`, tree);
          count++;
        }
      }
    }
    return count;
  }

  function isI18nManagerCandidate(val) {
    return Boolean(
      val &&
        typeof val === "object" &&
        val.translations instanceof Map &&
        val.fallbacks instanceof Map &&
        typeof val.update === "function" &&
        typeof val.register === "function" &&
        val.details &&
        typeof val.details === "object"
    );
  }

  /**
   * Scan the top of `#root`'s React Fiber tree (within ~5 hops) to locate `<I18nContext.Provider value={pM}>`.
   */
  function findI18nManager() {
    if (isI18nManagerCandidate(i18nManagerRef)) {
      return i18nManagerRef;
    }
    if (!root.document) {
      return null;
    }

    const rootEl = root.document.getElementById("root");
    if (!rootEl) {
      return null;
    }

    let rootFiber = null;
    if (rootEl._reactRootContainer && rootEl._reactRootContainer._internalRoot) {
      rootFiber = rootEl._reactRootContainer._internalRoot.current;
    } else {
      const propNames = Object.keys(rootEl);
      for (let i = 0; i < propNames.length; i++) {
        const k = propNames[i];
        if (k.startsWith("__reactContainer$") || k.startsWith("__reactFiber$")) {
          rootFiber = rootEl[k];
          break;
        }
      }
    }

    if (!rootFiber) {
      return null;
    }

    const queue = [rootFiber];
    const visited = new Set();
    let inspected = 0;

    while (queue.length > 0 && inspected < 80) {
      const fiber = queue.shift();
      if (!fiber || visited.has(fiber)) {
        continue;
      }
      visited.add(fiber);
      inspected++;

      const memoVal = fiber.memoizedProps && fiber.memoizedProps.value;
      if (isI18nManagerCandidate(memoVal)) {
        i18nManagerRef = memoVal;
        translationsMapRef = memoVal.translations;
        fallbacksMapRef = memoVal.fallbacks;
        return memoVal;
      }

      const pendingVal = fiber.pendingProps && fiber.pendingProps.value;
      if (isI18nManagerCandidate(pendingVal)) {
        i18nManagerRef = pendingVal;
        translationsMapRef = pendingVal.translations;
        fallbacksMapRef = pendingVal.fallbacks;
        return pendingVal;
      }

      const ctxVal =
        fiber.type &&
        fiber.type._context &&
        fiber.type._context._currentValue;
      if (isI18nManagerCandidate(ctxVal)) {
        i18nManagerRef = ctxVal;
        translationsMapRef = ctxVal.translations;
        fallbacksMapRef = ctxVal.fallbacks;
        return ctxVal;
      }

      if (fiber.child) {
        queue.push(fiber.child);
      }
      if (fiber.sibling) {
        queue.push(fiber.sibling);
      }
    }

    return null;
  }

  function registerExternalI18nManager(mgr) {
    if (isI18nManagerCandidate(mgr)) {
      i18nManagerRef = mgr;
      translationsMapRef = mgr.translations;
      fallbacksMapRef = mgr.fallbacks;
      for (const [modId, fb] of mgr.fallbacks.entries()) {
        knownModuleIds.add(modId);
        if (!recordedFallbacks.has(modId)) {
          origMapSet.call(recordedFallbacks, modId, fb);
          invalidateModuleCache(modId);
        }
      }
      populateTranslationsMap(mgr.translations, currentLocale);
      return true;
    }
    return false;
  }

  // ============================================================================
  // LAYER 2: Blockly v10 & Pybricks Custom Blocks AST-Safe Interception
  // ============================================================================

  const hookedBlocklyInstances = new WeakSet();
  const savedOperatorSvgIcons = new Map();
  let blocklyRef = null;

  function captureSvgIconsFromObject(obj) {
    if (!obj || typeof obj !== "object") {
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.startsWith("data:image/svg+xml")) {
        savedOperatorSvgIcons.set(k, v);
      }
    }
  }

  /**
   * Overlay standard + Pybricks Blockly messages for `locale` onto `Blockly.Msg`,
   * strictly preserving `Ss` SVG operator data URIs and `gs` empty C-block labels.
   */
  function applyBlocklyLocaleMessages(Blockly, locale) {
    if (!Blockly || !Blockly.Msg) {
      return;
    }
    const normLoc = normalizeLocale(locale) || currentLocale || "en";
    captureSvgIconsFromObject(Blockly.Msg);

    const stdMsgs = BKY_STD[normLoc] || BKY_STD.en || {};
    const customMsgs = BKY_CUSTOM[normLoc] || BKY_CUSTOM.en || {};

    for (const [k, v] of Object.entries(stdMsgs)) {
      if (!savedOperatorSvgIcons.has(k) && !(k in PROTECTED_OPERATOR_SYMBOLS)) {
        Blockly.Msg[k] = v;
      }
    }
    for (const [k, v] of Object.entries(customMsgs)) {
      if (!savedOperatorSvgIcons.has(k) && !(k in PROTECTED_OPERATOR_SYMBOLS)) {
        Blockly.Msg[k] = v;
      }
    }

    // Protection 1: Never overwrite `Ss` operator symbols or `data:image/svg+xml` icons
    for (const [k, sym] of Object.entries(PROTECTED_OPERATOR_SYMBOLS)) {
      Blockly.Msg[k] = sym;
    }
    for (const [k, svgUri] of savedOperatorSvgIcons.entries()) {
      Blockly.Msg[k] = svgUri;
    }

    // Protection 2: Preserve `gs` empty C-shaped block labels ("do" / "then" -> "")
    for (const emptyKey of EMPTY_C_BLOCK_KEYS) {
      Blockly.Msg[emptyKey] = "";
    }
  }

  function upgradeBlockDefinitions(definitions) {
    if (!Array.isArray(definitions)) {
      return definitions;
    }
    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      if (def && typeof def.message0 === "string") {
        const dynamicRef = MESSAGE0_UPGRADES[def.message0];
        if (dynamicRef) {
          def.message0 = dynamicRef;
        }
      }
    }
    return definitions;
  }

  /**
   * Install all 6 precision hooks onto the Blockly singleton before Pybricks blocks register.
   */
  function installBlocklyHooks(Blockly) {
    if (
      !Blockly ||
      (typeof Blockly !== "object" && typeof Blockly !== "function") ||
      !Blockly.Msg ||
      typeof Blockly.setLocale !== "function" ||
      !Blockly.common ||
      typeof Blockly.common.defineBlocksWithJsonArray !== "function"
    ) {
      return false;
    }

    if (hookedBlocklyInstances.has(Blockly)) {
      return true;
    }
    hookedBlocklyInstances.add(Blockly);
    blocklyRef = Blockly;

    // Hook 1: Upgrade hardcoded English `message0` templates to `%{BKY_PB_EXT_...}`
    const origDefineBlocks = Blockly.common.defineBlocksWithJsonArray;
    const wrappedDefineBlocks = function (definitions) {
      upgradeBlockDefinitions(definitions);
      return origDefineBlocks.call(this, definitions);
    };
    Blockly.common.defineBlocksWithJsonArray = wrappedDefineBlocks;
    if (typeof Blockly.defineBlocksWithJsonArray === "function") {
      Blockly.defineBlocksWithJsonArray = wrappedDefineBlocks;
    }

    // Hook 2: Wrap `Blockly.setLocale` to inject 420 std + 504 custom messages safely
    const origSetLocale = Blockly.setLocale;
    Blockly.setLocale = function (localeMap) {
      captureSvgIconsFromObject(Blockly.Msg);
      captureSvgIconsFromObject(localeMap);
      const res = origSetLocale.call(this, localeMap);
      if (safeGetStorage(STORAGE_KEY) !== "pseudolocalize") {
        applyBlocklyLocaleMessages(Blockly, currentLocale);
      }
      return res;
    };
    applyBlocklyLocaleMessages(Blockly, currentLocale);

    // Hook 3: Translate ToolboxCategory display `<span>` without altering `this.name_`
    if (
      Blockly.ToolboxCategory &&
      Blockly.ToolboxCategory.prototype &&
      typeof Blockly.ToolboxCategory.prototype.createLabelDom_ === "function"
    ) {
      const origCreateLabelDom = Blockly.ToolboxCategory.prototype.createLabelDom_;
      Blockly.ToolboxCategory.prototype.createLabelDom_ = function (name) {
        const catMap = TOOLBOX_CATEGORIES[currentLocale] || TOOLBOX_CATEGORIES.en;
        const displayName =
          catMap && typeof name === "string" && catMap[name] ? catMap[name] : name;
        const span = origCreateLabelDom.call(this, displayName);
        if (span && span.setAttribute && typeof name === "string") {
          span.setAttribute("data-pb-i18n-category", name);
        }
        return span;
      };
    }

    // Hook 4: Translate FlyoutButton section headers before SVG bbox width calculation
    if (
      Blockly.FlyoutButton &&
      Blockly.FlyoutButton.prototype &&
      typeof Blockly.FlyoutButton.prototype.createDom === "function"
    ) {
      const origFlyoutCreateDom = Blockly.FlyoutButton.prototype.createDom;
      Blockly.FlyoutButton.prototype.createDom = function () {
        if (this.isLabel_) {
          if (typeof this.__pbOrigLabelText !== "string") {
            this.__pbOrigLabelText = this.text;
          }
          const flyoutMap = FLYOUT_LABELS[currentLocale] || FLYOUT_LABELS.en;
          if (flyoutMap && flyoutMap[this.__pbOrigLabelText]) {
            this.text = flyoutMap[this.__pbOrigLabelText];
          }
        }
        return origFlyoutCreateDom.apply(this, arguments);
      };
    }

    // Hook 5: Translate non-serializable syntax FieldLabels (`empty list`, `list with`, `from`, `to`, `with steps of`)
    // Strictly requires exact `Blockly.FieldLabel` constructor + `!this.SERIALIZABLE` so `FieldLabelSerializable`,
    // `field_var_readonly`, and Python variable/parameter names are 100% untouched.
    if (
      Blockly.FieldLabel &&
      Blockly.FieldLabel.prototype &&
      typeof Blockly.FieldLabel.prototype.setValue === "function"
    ) {
      const origFieldLabelSetValue = Blockly.FieldLabel.prototype.setValue;
      Blockly.FieldLabel.prototype.setValue = function (newValue, fireChangeEvent) {
        const isPlainNonSerializableLabel =
          this.constructor === Blockly.FieldLabel &&
          !this.SERIALIZABLE &&
          (!Blockly.FieldLabelSerializable || !(this instanceof Blockly.FieldLabelSerializable));

        if (isPlainNonSerializableLabel && typeof newValue === "string") {
          const msgKey = FIELD_LABELS[newValue] || REVERSE_FIELD_LABELS[newValue];
          if (msgKey) {
            this.__pbFieldLabelKey = msgKey;
            const localized =
              (Blockly.Msg && Blockly.Msg[msgKey]) ||
              (BKY_CUSTOM[currentLocale] && BKY_CUSTOM[currentLocale][msgKey]) ||
              newValue;
            return origFieldLabelSetValue.call(this, localized, fireChangeEvent);
          }
        }
        return origFieldLabelSetValue.call(this, newValue, fireChangeEvent);
      };
    }

    // Hook 6: Ensure `field_dropdown_more_details` resolves options dynamically from `Blockly.Msg`
    // while `getValue()` remains the invariant Python enum identifier (e.g. "Stop.HOLD", "Port.A").
    if (
      Blockly.fieldRegistry &&
      typeof Blockly.fieldRegistry.register === "function"
    ) {
      const origFieldRegister = Blockly.fieldRegistry.register;
      Blockly.fieldRegistry.register = function (type, fieldClass) {
        if (type === "field_dropdown_more_details" && typeof fieldClass === "function") {
          class LocalizedMoreDetailsDropdown extends fieldClass {
            constructor(value, validator, config) {
              super(value, validator, config);
              if (config && Array.isArray(config.menu) && typeof fieldClass.parseOptions === "function") {
                const menuSpec = config.menu;
                const menuFilter = config.menuFilter;
                this.menuGenerator_ = function () {
                  const dynamicOptions = fieldClass.parseOptions(menuSpec);
                  if (typeof menuFilter !== "function") {
                    return dynamicOptions;
                  }
                  const block = this.getSourceBlock();
                  if (!block) {
                    return dynamicOptions;
                  }
                  const mask = menuFilter(block);
                  if (
                    Array.isArray(mask) &&
                    mask.length === dynamicOptions.length &&
                    mask.some(Boolean)
                  ) {
                    return dynamicOptions.filter((_, idx) => Boolean(mask[idx]));
                  }
                  return dynamicOptions;
                };
              }
            }

            static fromJson(options) {
              return new this([], undefined, options);
            }
          }
          return origFieldRegister.call(this, type, LocalizedMoreDetailsDropdown);
        }
        return origFieldRegister.call(this, type, fieldClass);
      };
    }

    return true;
  }

  /**
   * Refresh live Blockly non-serializable FieldLabels & toolbox category spans if needed.
   */
  function refreshLiveBlocklyDom() {
    if (!root.document) {
      return;
    }
    const catMap = TOOLBOX_CATEGORIES[currentLocale] || TOOLBOX_CATEGORIES.en;
    if (catMap) {
      const catSpans = root.document.querySelectorAll("span[data-pb-i18n-category]");
      for (let i = 0; i < catSpans.length; i++) {
        const span = catSpans[i];
        const origCat = span.getAttribute("data-pb-i18n-category");
        if (origCat && catMap[origCat] && span.textContent !== catMap[origCat]) {
          span.textContent = catMap[origCat];
        }
      }
    }
  }

  // Intercept `self.webpackChunk_pybricks_pybricks_code` with an acyclic `.push` descriptor
  const patchedChunks = new WeakSet();

  function patchWebpackChunk(chunk) {
    if (!chunk || typeof chunk !== "object" || patchedChunks.has(chunk)) {
      return;
    }
    patchedChunks.add(chunk);
    const moreModules = chunk[1];
    if (!moreModules || typeof moreModules !== "object") {
      return;
    }
    const modIds = Object.keys(moreModules);
    for (let i = 0; i < modIds.length; i++) {
      const id = modIds[i];
      const origFactory = moreModules[id];
      if (typeof origFactory !== "function" || origFactory.__pbI18nWrapped) {
        continue;
      }
      const wrappedFactory = function (module, exports, webpackRequire) {
        const result = origFactory.call(this, module, exports, webpackRequire);
        const exp = module && module.exports;
        if (exp && (typeof exp === "object" || typeof exp === "function")) {
          installBlocklyHooks(exp);
        }
        return result;
      };
      wrappedFactory.__pbI18nWrapped = true;
      moreModules[id] = wrappedFactory;
    }
  }

  function installWebpackChunkHook() {
    const chunkArray = (root.webpackChunk_pybricks_pybricks_code =
      root.webpackChunk_pybricks_pybricks_code || []);

    if (chunkArray.__pbI18nHooked) {
      return;
    }
    Object.defineProperty(chunkArray, "__pbI18nHooked", {
      value: true,
      enumerable: false,
      configurable: false
    });

    for (let i = 0; i < chunkArray.length; i++) {
      patchWebpackChunk(chunkArray[i]);
    }

    const nativeArrayPush = Array.prototype.push;
    const currentPush =
      typeof chunkArray.push === "function" && chunkArray.push !== nativeArrayPush
        ? chunkArray.push.bind(chunkArray)
        : function () {
            return nativeArrayPush.apply(chunkArray, arguments);
          };

    let activePush = function (chunk) {
      patchWebpackChunk(chunk);
      return currentPush.apply(chunkArray, arguments);
    };

    try {
      Object.defineProperty(chunkArray, "push", {
        configurable: true,
        enumerable: false,
        get() {
          return activePush;
        },
        set(nextWebpackPush) {
          if (typeof nextWebpackPush === "function") {
            activePush = function (chunk) {
              patchWebpackChunk(chunk);
              return nextWebpackPush.apply(chunkArray, arguments);
            };
          }
        }
      });
    } catch (_) {
      chunkArray.push = activePush;
    }
  }

  installWebpackChunkHook();

  // ============================================================================
  // LAYER 3 & LAYER 4: Whitelisted DOM Micro-Patches, Blacklist & Switcher UI
  // ============================================================================

  function isInsideBlacklistedZone(node) {
    if (!node) {
      return true;
    }
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || typeof el.closest !== "function") {
      return false;
    }
    return Boolean(el.closest(BLACKLIST_SELECTOR));
  }

  function getActiveDomPatchConfig() {
    return DOM_PATCHES[currentLocale] || DOM_PATCHES.en || {};
  }

  function buildReverseMap(enMap) {
    const rev = Object.create(null);
    if (!enMap) {
      return rev;
    }
    for (const origKey of Object.keys(enMap)) {
      rev[origKey] = origKey;
      for (const loc of Object.keys(DOM_PATCHES)) {
        const sub = DOM_PATCHES[loc];
        for (const groupName of ["hubNames", "telemetryLabels", "dialogButtons"]) {
          const val = sub && sub[groupName] && sub[groupName][origKey];
          if (typeof val === "string") {
            rev[val] = origKey;
          }
        }
      }
    }
    return rev;
  }

  const REVERSE_HUB_NAMES = buildReverseMap(DOM_PATCHES.en && DOM_PATCHES.en.hubNames);
  const REVERSE_TELEMETRY_LABELS = buildReverseMap(
    DOM_PATCHES.en && DOM_PATCHES.en.telemetryLabels
  );
  const REVERSE_DIALOG_BUTTONS = buildReverseMap(
    DOM_PATCHES.en && DOM_PATCHES.en.dialogButtons
  );

  /**
   * Apply strict-whitelist Layer 3 micro-patches while honoring the Layer 4 subtree blacklist.
   */
  function applyDomPatches(scopeRoot) {
    if (!root.document) {
      return;
    }
    const queryRoot =
      scopeRoot && typeof scopeRoot.querySelectorAll === "function"
        ? scopeRoot
        : root.document;
    const patchCfg = getActiveDomPatchConfig();

    // 1. File explorer search input placeholder
    if (patchCfg.searchPlaceholder) {
      const searchInputs = queryRoot.querySelectorAll(
        ".rct-tree-search-input-container input, input.rct-tree-search-input"
      );
      for (let i = 0; i < searchInputs.length; i++) {
        const input = searchInputs[i];
        if (isInsideBlacklistedZone(input)) {
          continue;
        }
        if (input.placeholder !== patchCfg.searchPlaceholder) {
          input.placeholder = patchCfg.searchPlaceholder;
        }
      }
    }

    // 2. Telemetry mode buttons (`reflection`, `ambient light`, `calibrate`, etc.)
    if (patchCfg.telemetryLabels) {
      const modeBtns = queryRoot.querySelectorAll(".pb-telemetry-mode-button");
      for (let i = 0; i < modeBtns.length; i++) {
        const btn = modeBtns[i];
        if (isInsideBlacklistedZone(btn)) {
          continue;
        }
        const rawLabel =
          btn.getAttribute("data-pb-i18n-orig-label") ||
          REVERSE_TELEMETRY_LABELS[btn.getAttribute("title") || ""] ||
          REVERSE_TELEMETRY_LABELS[btn.getAttribute("aria-label") || ""];
        if (rawLabel && patchCfg.telemetryLabels[rawLabel]) {
          btn.setAttribute("data-pb-i18n-orig-label", rawLabel);
          const nextText = patchCfg.telemetryLabels[rawLabel];
          if (btn.getAttribute("title") !== nextText) {
            btn.setAttribute("title", nextText);
          }
          if (btn.getAttribute("aria-label") !== nextText) {
            btn.setAttribute("aria-label", nextText);
          }
        }
      }

      // AI Camera / Vision SVG `foreignObject` telemetry overlay labels (imperatively created)
      const foSpans = queryRoot.querySelectorAll("svg foreignObject span");
      for (let i = 0; i < foSpans.length; i++) {
        const span = foSpans[i];
        if (span.childElementCount > 0 || isInsideBlacklistedZone(span)) {
          continue;
        }
        const currentText = (span.textContent || "").trim();
        const origKey =
          span.getAttribute("data-pb-i18n-orig-telemetry") ||
          REVERSE_TELEMETRY_LABELS[currentText];
        if (origKey && patchCfg.telemetryLabels[origKey]) {
          span.setAttribute("data-pb-i18n-orig-telemetry", origKey);
          const nextLabel = patchCfg.telemetryLabels[origKey];
          if (span.textContent !== nextLabel) {
            span.textContent = nextLabel;
          }
        }
      }
    }

    // 3. Hub picker buttons & telemetry dialog hub subtitle
    if (patchCfg.hubNames) {
      const hubButtons = queryRoot.querySelectorAll(".pb-hub-button");
      for (let i = 0; i < hubButtons.length; i++) {
        const btn = hubButtons[i];
        if (isInsideBlacklistedZone(btn)) {
          continue;
        }
        const origHub =
          btn.getAttribute("data-pb-i18n-orig-hub") ||
          REVERSE_HUB_NAMES[btn.getAttribute("aria-label") || ""];
        if (origHub && patchCfg.hubNames[origHub]) {
          btn.setAttribute("data-pb-i18n-orig-hub", origHub);
          const localizedHub = patchCfg.hubNames[origHub];
          if (btn.getAttribute("aria-label") !== localizedHub) {
            btn.setAttribute("aria-label", localizedHub);
          }
          const imgs = btn.querySelectorAll("img[title]");
          for (let j = 0; j < imgs.length; j++) {
            const img = imgs[j];
            const origImgHub =
              img.getAttribute("data-pb-i18n-orig-hub") ||
              REVERSE_HUB_NAMES[img.getAttribute("title") || ""] ||
              origHub;
            if (origImgHub && patchCfg.hubNames[origImgHub]) {
              img.setAttribute("data-pb-i18n-orig-hub", origImgHub);
              if (img.getAttribute("title") !== patchCfg.hubNames[origImgHub]) {
                img.setAttribute("title", patchCfg.hubNames[origImgHub]);
              }
            }
          }
        }
      }

      // Mutate `Text.nodeValue` in place (never detaching React's `HostText` node)
      const hubSubtitles = queryRoot.querySelectorAll(".pb-telemetry-dialog-subtitle");
      for (let i = 0; i < hubSubtitles.length; i++) {
        const sub = hubSubtitles[i];
        if (isInsideBlacklistedZone(sub)) {
          continue;
        }
        const firstNode = sub.firstChild;
        if (firstNode && firstNode.nodeType === 3) {
          const rawVal = (firstNode.__pbI18nOrigHub || firstNode.nodeValue || "").trim();
          const origHub = REVERSE_HUB_NAMES[rawVal];
          if (origHub && patchCfg.hubNames[origHub]) {
            firstNode.__pbI18nOrigHub = origHub;
            if (firstNode.nodeValue !== patchCfg.hubNames[origHub]) {
              firstNode.nodeValue = patchCfg.hubNames[origHub];
            }
          }
        }
      }
    }

    // 4. BlueprintJS multistep wizard default buttons (`Back`, `Next`, `Submit`, `Close`, `OK`)
    if (patchCfg.dialogButtons) {
      const wizardBtns = queryRoot.querySelectorAll(
        ".bp5-multistep-dialog .bp5-dialog-footer-actions .bp5-button-text, .bp5-multistep-dialog-footer .bp5-button-text"
      );
      for (let i = 0; i < wizardBtns.length; i++) {
        const span = wizardBtns[i];
        if (span.childElementCount > 0 || isInsideBlacklistedZone(span)) {
          continue;
        }
        const firstText = span.firstChild;
        if (firstText && firstText.nodeType === 3) {
          const currentVal = (firstText.nodeValue || "").trim();
          const origBtn =
            firstText.__pbI18nOrigBtn || REVERSE_DIALOG_BUTTONS[currentVal];
          if (origBtn && patchCfg.dialogButtons[origBtn]) {
            firstText.__pbI18nOrigBtn = origBtn;
            const targetText = patchCfg.dialogButtons[origBtn];
            if (firstText.nodeValue !== targetText) {
              firstText.nodeValue = targetText;
            }
          }
        }
      }
    }

    // 5. Ensure native Settings panel language dropdown & floating quick pill stay synced
    mountOrUpdateSettingsSelector();
    mountOrUpdateQuickPill();
  }

  /**
   * Inject or update the native BlueprintJS v5 language selector inside `.pb-settings`
   * right below the first `.bp5-form-group` (Appearance).
   */
  function mountOrUpdateSettingsSelector() {
    if (!root.document) {
      return;
    }
    const settingsPane = root.document.querySelector(".pb-settings");
    if (!settingsPane) {
      return;
    }

    const patchCfg = getActiveDomPatchConfig();
    const headingText = patchCfg.languageHeading || "Language";
    const helperText =
      patchCfg.languageHelper ||
      "Switch UI & block language (Python code is never modified).";

    let groupEl = settingsPane.querySelector(".pb-i18n-settings-group");
    if (!groupEl) {
      groupEl = root.document.createElement("div");
      groupEl.className = "bp5-form-group pb-i18n-settings-group";

      const labelEl = root.document.createElement("label");
      labelEl.className = "bp5-label pb-i18n-settings-label";
      labelEl.setAttribute("for", "pb-i18n-language-select");

      const contentEl = root.document.createElement("div");
      contentEl.className = "bp5-form-content";

      const selectWrap = root.document.createElement("div");
      selectWrap.className = "bp5-html-select pb-i18n-html-select";

      const selectEl = root.document.createElement("select");
      selectEl.id = "pb-i18n-language-select";
      for (const item of SUPPORTED_LOCALES) {
        const opt = root.document.createElement("option");
        opt.value = item.code;
        opt.textContent =
          item.nativeLabel === item.label
            ? item.nativeLabel
            : `${item.nativeLabel} (${item.label})`;
        selectEl.appendChild(opt);
      }
      selectEl.addEventListener("change", (ev) => {
        setLocale(ev.target.value, { source: "settings-panel" });
      });

      const caretSpan = root.document.createElement("span");
      caretSpan.className = "bp5-icon bp5-icon-double-caret-vertical";
      caretSpan.setAttribute("aria-hidden", "true");
      caretSpan.innerHTML =
        '<svg data-icon="double-caret-vertical" width="16" height="16" viewBox="0 0 16 16"><path d="M5 7h6a1.003 1.003 0 00.71-1.71l-3-3C8.53 2.11 8.28 2 8 2s-.53.11-.71.29l-3 3A1.003 1.003 0 005 7zm6 2H5a1.003 1.003 0 00-.71 1.71l3 3c.18.18.43.29.71.29s.53-.11.71-.29l3-3A1.003 1.003 0 0011 9z" fill="currentColor" fill-rule="evenodd"></path></svg>';

      selectWrap.appendChild(selectEl);
      selectWrap.appendChild(caretSpan);

      const helperEl = root.document.createElement("div");
      helperEl.className = "bp5-form-helper-text pb-i18n-settings-helper";

      contentEl.appendChild(selectWrap);
      contentEl.appendChild(helperEl);
      groupEl.appendChild(labelEl);
      groupEl.appendChild(contentEl);

      const firstGroup = settingsPane.querySelector(":scope > .bp5-form-group");
      if (firstGroup && firstGroup.nextSibling) {
        settingsPane.insertBefore(groupEl, firstGroup.nextSibling);
      } else {
        settingsPane.appendChild(groupEl);
      }
    }

    const labelEl = groupEl.querySelector(".pb-i18n-settings-label");
    if (labelEl && labelEl.textContent !== headingText) {
      labelEl.textContent = headingText;
    }
    const helperEl = groupEl.querySelector(".pb-i18n-settings-helper");
    if (helperEl && helperEl.textContent !== helperText) {
      helperEl.textContent = helperText;
    }
    const selectEl = groupEl.querySelector("#pb-i18n-language-select");
    if (selectEl && selectEl.value !== currentLocale) {
      selectEl.value = currentLocale;
    }
  }

  /**
   * Mount or update a collapsible quick-switch language capsule directly on `document.body`
   * (completely outside `#root` so React's virtual DOM never sees it).
   */
  function mountOrUpdateQuickPill() {
    if (!root.document || !root.document.body) {
      return;
    }

    let pill = root.document.getElementById("pb-i18n-quick-switcher");
    if (quickPillHidden) {
      if (pill) {
        pill.style.display = "none";
      }
      return;
    }

    const patchCfg = getActiveDomPatchConfig();
    const tooltip =
      patchCfg.quickSwitchTooltip || "Switch Pybricks UI & Blocks language";

    if (!pill) {
      pill = root.document.createElement("div");
      pill.id = "pb-i18n-quick-switcher";
      pill.className = "pb-i18n-pill";
      pill.setAttribute("role", "region");

      const toggleBtn = root.document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "pb-i18n-pill-toggle";
      toggleBtn.innerHTML =
        '<svg class="pb-i18n-globe-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><ellipse cx="8" cy="8" rx="3" ry="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 8h12M3.2 5h9.6M3.2 11h9.6" stroke="currentColor" stroke-width="1.1"/></svg><span class="pb-i18n-pill-current"></span>';
      toggleBtn.addEventListener("click", () => {
        quickPillCollapsed = !quickPillCollapsed;
        safeSetStorage(PILL_COLLAPSED_KEY, quickPillCollapsed ? "1" : "0");
        mountOrUpdateQuickPill();
      });

      const optionsBar = root.document.createElement("div");
      optionsBar.className = "pb-i18n-pill-options";

      for (const item of SUPPORTED_LOCALES) {
        const btn = root.document.createElement("button");
        btn.type = "button";
        btn.className = "pb-i18n-pill-btn";
        btn.setAttribute("data-locale", item.code);
        btn.textContent = item.short;
        btn.title = `${item.nativeLabel} (${item.label})`;
        btn.addEventListener("click", () => {
          setLocale(item.code, { source: "quick-pill" });
        });
        optionsBar.appendChild(btn);
      }

      pill.appendChild(toggleBtn);
      pill.appendChild(optionsBar);
      root.document.body.appendChild(pill);
    }

    pill.style.display = "";
    pill.classList.toggle("pb-i18n-pill--collapsed", quickPillCollapsed);

    const toggleBtn = pill.querySelector(".pb-i18n-pill-toggle");
    if (toggleBtn) {
      toggleBtn.title = tooltip;
      toggleBtn.setAttribute("aria-label", tooltip);
    }

    const activeMeta =
      SUPPORTED_LOCALES.find((item) => item.code === currentLocale) ||
      SUPPORTED_LOCALES[0];
    const currentBadge = pill.querySelector(".pb-i18n-pill-current");
    if (currentBadge) {
      currentBadge.textContent = activeMeta.short;
    }

    const optionButtons = pill.querySelectorAll(".pb-i18n-pill-btn");
    for (let i = 0; i < optionButtons.length; i++) {
      const btn = optionButtons[i];
      const isSelected = btn.getAttribute("data-locale") === currentLocale;
      btn.classList.toggle("pb-i18n-pill-btn--active", isSelected);
      btn.setAttribute("aria-pressed", String(isSelected));
    }
  }

  // Debounced MutationObserver strictly for Layer 3 whitelisted UI elements
  let patchScheduled = false;
  function scheduleDomPatches() {
    if (patchScheduled) {
      return;
    }
    patchScheduled = true;
    const scheduleFn =
      typeof root.requestAnimationFrame === "function"
        ? root.requestAnimationFrame.bind(root)
        : (fn) => setTimeout(fn, 16);
    scheduleFn(() => {
      patchScheduled = false;
      applyDomPatches();
      ensureManagerSyncedAfterMount();
    });
  }

  function startDomObserver() {
    if (!root.document || typeof root.MutationObserver !== "function") {
      return;
    }
    const target = root.document.documentElement;
    if (!target) {
      return;
    }
    const observer = new root.MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (!isInsideBlacklistedZone(m.target)) {
          scheduleDomPatches();
          break;
        }
      }
    });
    observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  // ============================================================================
  // Live Hot-Switch Controller & Bridge Messaging
  // ============================================================================

  function notifyBridge(payload) {
    try {
      if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
        root.dispatchEvent(
          new root.CustomEvent(PAGE_TO_BRIDGE_EVENT, { detail: payload })
        );
      }
    } catch (_) {
      // Ignore environment without CustomEvent
    }
  }

  function ensureManagerSyncedAfterMount() {
    const mgr = findI18nManager();
    if (!mgr) {
      return false;
    }
    populateTranslationsMap(mgr.translations, currentLocale);
    if (mgr.details && mgr.details.locale !== currentLocale) {
      mgr.update({
        ...mgr.details,
        locale: currentLocale,
        pseudolocalize: false
      });
    }
    return true;
  }

  /**
   * Switch the active UI & Blockly language immediately without reloading the page.
   * Python code, variable names, Monaco editor buffers, and REPL output remain 100% untouched.
   */
  function setLocale(nextRawLocale, options) {
    const opts = options || {};
    const normLoc = normalizeLocale(nextRawLocale);
    if (!normLoc) {
      return currentLocale;
    }

    const changed = normLoc !== currentLocale;
    currentLocale = normLoc;
    safeSetStorage(STORAGE_KEY, normLoc);
    syncDocumentLang(normLoc);

    // 1. Pre-populate `@shopify/react-i18n` translations Map & trigger live React + Blockly rebuild
    const mgr = findI18nManager();
    const targetMap = (mgr && mgr.translations) || translationsMapRef;
    if (targetMap) {
      populateTranslationsMap(targetMap, normLoc);
    }
    if (mgr) {
      if (!mgr.details || mgr.details.locale !== normLoc || mgr.details.pseudolocalize) {
        mgr.update({
          ...mgr.details,
          locale: normLoc,
          pseudolocalize: false
        });
      }
    }

    // 2. Synchronously update `Blockly.Msg` and live toolbox category labels
    if (blocklyRef) {
      applyBlocklyLocaleMessages(blocklyRef, normLoc);
    }
    refreshLiveBlocklyDom();

    // 3. Apply Layer 3 whitelisted DOM micro-patches & sync dual switcher UI
    applyDomPatches();

    // 4. Notify ISOLATED content bridge (unless originated from bridge sync)
    if (opts.source !== "bridge-sync" || changed) {
      notifyBridge({
        type: "LOCALE_CHANGED",
        locale: normLoc,
        quickPillHidden,
        source: opts.source || "api"
      });
    }

    return normLoc;
  }

  function setQuickPillHidden(hidden, options) {
    const nextHidden = Boolean(hidden);
    if (quickPillHidden === nextHidden) {
      return;
    }
    quickPillHidden = nextHidden;
    mountOrUpdateQuickPill();
    if (!options || options.source !== "bridge-sync") {
      notifyBridge({
        type: "PILL_VISIBILITY_CHANGED",
        quickPillHidden,
        locale: currentLocale
      });
    }
  }

  function handleBridgeCommand(cmd) {
    if (!cmd || typeof cmd !== "object") {
      return;
    }
    if (typeof cmd.quickPillHidden === "boolean") {
      setQuickPillHidden(cmd.quickPillHidden, { source: "bridge-sync" });
    }
    if (cmd.type === "SET_LOCALE" && cmd.locale) {
      setLocale(cmd.locale, { source: "bridge-sync" });
    } else if (cmd.type === "SET_PILL_VISIBILITY") {
      setQuickPillHidden(Boolean(cmd.quickPillHidden), { source: "bridge-sync" });
    } else if (cmd.type === "GET_STATE") {
      notifyBridge({
        type: "STATE_SNAPSHOT",
        locale: currentLocale,
        quickPillHidden
      });
    }
  }

  if (typeof root.addEventListener === "function") {
    root.addEventListener(BRIDGE_TO_PAGE_EVENT, (ev) => {
      handleBridgeCommand(ev && ev.detail);
    });

    root.addEventListener("message", (ev) => {
      if (ev.source !== root || !ev.data || ev.data.source !== "pybricks-i18n-bridge") {
        return;
      }
      handleBridgeCommand(ev.data);
    });

    if (root.document) {
      if (root.document.readyState === "loading") {
        root.document.addEventListener(
          "DOMContentLoaded",
          () => {
            applyDomPatches();
            ensureManagerSyncedAfterMount();
            startDomObserver();
          },
          { once: true }
        );
      } else {
        applyDomPatches();
        ensureManagerSyncedAfterMount();
        startDomObserver();
      }
    }
  }

  // Expose public engine handle on `window.__PYBRICKS_I18N_ENGINE__`
  root.__PYBRICKS_I18N_ENGINE__ = {
    version: "1.0.0",
    getLocale: () => currentLocale,
    setLocale,
    normalizeLocale,
    getLocaleSubtags,
    getSupportedLocales: () => SUPPORTED_LOCALES.slice(),
    setQuickPillHidden,
    isQuickPillHidden: () => quickPillHidden,
    applyDomPatches,
    installBlocklyHooks,
    getBlockly: () => blocklyRef,
    registerExternalI18nManager,
    getModuleTranslation,
    isInsideBlacklistedZone,
    getStats: () => ({
      locale: currentLocale,
      knownModules: knownModuleIds.size,
      recordedFallbacks: recordedFallbacks.size,
      hasI18nManager: Boolean(findI18nManager()),
      hasBlockly: Boolean(blocklyRef),
      preservedSvgIcons: savedOperatorSvgIcons.size
    })
  };

  notifyBridge({
    type: "ENGINE_READY",
    locale: currentLocale,
    quickPillHidden
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
