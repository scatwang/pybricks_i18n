#!/usr/bin/env node
/**
 * End-to-End Verification Suite for Pybricks Code Multi-Language Extension
 *
 * Directly loads the real production Webpack bundles from `code.pybricks.com`
 * (`main.js` + `498.js` + `8440.js` + `8475.js` + `4852.js`) alongside the
 * extension's catalogs, MAIN-world engine, and ISOLATED-world bridge to verify:
 *
 *   1. Extension Manifest & Catalog Integrity (46 UI modules + 924 Blockly keys, 0 placeholder drift)
 *   2. Live Hot-Switch Simulation (`en -> zh-CN -> es -> nl -> en` across Layer 1, Layer 2, Layer 3 & Bridge)
 *   3. Zero-Code-Mutation Proof (100% byte-for-byte identical MicroPython output & JSON AST across all 4 languages)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const SUPPORTED_LOCALES = ["en", "zh-CN", "zh-TW", "es", "nl"];
const CACHE_DIRS = [
  process.env.PYBRICKS_BUNDLE_DIR,
  "/tmp/pybricks-i18n-dist-cache",
  path.join(PROJECT_ROOT, ".cache", "pybricks-dist")
].filter(Boolean);

// ============================================================================
// Production Bundle Loader (uses local cache or downloads from code.pybricks.com)
// ============================================================================

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

async function ensureProductionBundles() {
  for (const candidate of CACHE_DIRS) {
    if (
      fs.existsSync(path.join(candidate, "main.js")) &&
      fs.existsSync(path.join(candidate, "498.js")) &&
      fs.existsSync(path.join(candidate, "8440.js")) &&
      fs.existsSync(path.join(candidate, "8475.js")) &&
      fs.existsSync(path.join(candidate, "4852.js")) &&
      fs.existsSync(path.join(candidate, "5261.js"))
    ) {
      return candidate;
    }
  }

  const targetDir = CACHE_DIRS[0];
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`[setup] Downloading live production bundles from https://code.pybricks.com ...`);

  const html = await fetchText("https://code.pybricks.com/");
  const mainMatch = html.match(/src="(\/static\/js\/main\.[a-f0-9]+\.js)"/);
  assert(mainMatch, "Could not locate main.<hash>.js in code.pybricks.com index.html");

  const mainJs = await fetchText(`https://code.pybricks.com${mainMatch[1]}`);
  fs.writeFileSync(path.join(targetDir, "main.js"), mainJs);

  for (const chunkId of ["498", "8440", "8475", "4852", "5261"]) {
    const hashMatch = mainJs.match(new RegExp(`\\b${chunkId}:"([a-f0-9]+)"`));
    assert(hashMatch, `Could not find chunk hash for ${chunkId} in main.js`);
    const chunkUrl = `https://code.pybricks.com/static/js/${chunkId}.${hashMatch[1]}.chunk.js`;
    const chunkJs = await fetchText(chunkUrl);
    fs.writeFileSync(path.join(targetDir, `${chunkId}.js`), chunkJs);
  }

  return targetDir;
}

// ============================================================================
// Lightweight DOM & Browser Sandbox for Headless React Fiber + Blockly VM
// ============================================================================

function createDomEnvironment(initialLocale = "en") {
  const idIndex = new Map();

  function matchesSimpleSelector(el, sel) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    const trimmed = sel.trim();
    if (!trimmed) {
      return false;
    }

    if (trimmed.startsWith(":scope >")) {
      return false; // Handled at query level
    }

    // Attribute selector support e.g. span[data-pb-i18n-category], img[title], .lang-card[data-locale]
    const attrMatch = trimmed.match(/^([a-zA-Z0-9_.*#-]*)\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/);
    if (attrMatch) {
      const [, basePart, attrName, attrVal] = attrMatch;
      if (basePart && !matchesSimpleSelector(el, basePart)) {
        return false;
      }
      const actual = el.getAttribute(attrName);
      if (actual === null) {
        return false;
      }
      return attrVal === undefined ? true : actual === attrVal;
    }

    if (trimmed.startsWith("#")) {
      return el.id === trimmed.slice(1);
    }
    if (trimmed.startsWith(".")) {
      const classes = trimmed.slice(1).split(".").filter(Boolean);
      return classes.every((c) => el.classList.contains(c));
    }
    if (trimmed.includes(".")) {
      const [tagPart, ...clsParts] = trimmed.split(".");
      if (tagPart && el.tagName.toLowerCase() !== tagPart.toLowerCase()) {
        return false;
      }
      return clsParts.every((c) => el.classList.contains(c));
    }
    return el.tagName.toLowerCase() === trimmed.toLowerCase();
  }

  function matchesCompoundSelector(el, selectorGroup) {
    const parts = selectorGroup.trim().split(/\s+/);
    let curr = el;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!curr || curr.nodeType !== 1) {
        return false;
      }
      if (i === parts.length - 1) {
        if (!matchesSimpleSelector(curr, parts[i])) {
          return false;
        }
        curr = curr.parentElement;
      } else {
        while (curr && !matchesSimpleSelector(curr, parts[i])) {
          curr = curr.parentElement;
        }
        if (!curr) {
          return false;
        }
        curr = curr.parentElement;
      }
    }
    return true;
  }

  function matchesAnySelector(el, selectorList) {
    const groups = selectorList.split(",");
    for (const g of groups) {
      const trimmed = g.trim();
      if (!trimmed) continue;
      if (matchesCompoundSelector(el, trimmed)) {
        return true;
      }
    }
    return false;
  }

  function walkDescendants(rootNode, out = []) {
    const kids = rootNode.children || [];
    for (const child of kids) {
      if (child && child.nodeType === 1) {
        out.push(child);
        walkDescendants(child, out);
      }
    }
    return out;
  }

  function makeTextNode(text) {
    let val = String(text ?? "");
    return {
      nodeType: 3,
      parentElement: null,
      parentNode: null,
      hasChildNodes: () => false,
      get nodeValue() {
        return val;
      },
      set nodeValue(next) {
        val = String(next ?? "");
      },
      get textContent() {
        return val;
      },
      set textContent(next) {
        val = String(next ?? "");
      }
    };
  }

  function makeElement(tagName = "div") {
    const attrs = Object.create(null);
    const classSet = new Set();
    const listeners = new Map();
    const childNodes = [];
    let idVal = "";
    let valueProp = "";
    let placeholderProp = "";

    const el = {
      nodeType: 1,
      tagName: String(tagName).toUpperCase(),
      parentElement: null,
      parentNode: null,
      style: {
        display: "",
        setProperty() {},
        getPropertyValue: () => ""
      },
      dataset: {},
      childNodes,
      get children() {
        return childNodes.filter((n) => n && n.nodeType === 1);
      },
      get firstChild() {
        return childNodes[0] || null;
      },
      get nextSibling() {
        if (!el.parentNode) return null;
        const siblings = el.parentNode.childNodes;
        const idx = siblings.indexOf(el);
        return idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
      },
      get childElementCount() {
        return el.children.length;
      },
      hasChildNodes() {
        return childNodes.length > 0;
      },
      hasAttributes() {
        return Object.keys(attrs).length > 0;
      },
      get attributes() {
        return Object.entries(attrs).map(([name, value]) => ({ name, value }));
      },
      get id() {
        return idVal;
      },
      set id(next) {
        if (idVal && idIndex.get(idVal) === el) {
          idIndex.delete(idVal);
        }
        idVal = String(next || "");
        if (idVal) {
          idIndex.set(idVal, el);
          attrs.id = idVal;
        }
      },
      get className() {
        return Array.from(classSet).join(" ");
      },
      set className(next) {
        classSet.clear();
        String(next || "")
          .split(/\s+/)
          .filter(Boolean)
          .forEach((c) => classSet.add(c));
        attrs.class = el.className;
      },
      get value() {
        return valueProp;
      },
      set value(v) {
        valueProp = String(v ?? "");
        attrs.value = valueProp;
      },
      get placeholder() {
        return placeholderProp;
      },
      set placeholder(v) {
        placeholderProp = String(v ?? "");
        attrs.placeholder = placeholderProp;
      },
      get textContent() {
        return childNodes.map((c) => c.textContent || "").join("");
      },
      set textContent(next) {
        childNodes.length = 0;
        const str = String(next ?? "");
        if (str.length > 0) {
          const tn = makeTextNode(str);
          tn.parentElement = el;
          tn.parentNode = el;
          childNodes.push(tn);
        }
      },
      innerHTML: "",
      setAttribute(name, val) {
        const str = String(val);
        attrs[name] = str;
        if (name === "id") {
          el.id = str;
        } else if (name === "class") {
          el.className = str;
        } else if (name === "placeholder") {
          placeholderProp = str;
        } else if (name === "value") {
          valueProp = str;
        }
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
      removeAttribute(name) {
        delete attrs[name];
      },
      appendChild(child) {
        if (!child) return child;
        if (child.parentNode && child.parentNode !== el) {
          child.parentNode.removeChild(child);
        }
        const existingIdx = childNodes.indexOf(child);
        if (existingIdx >= 0) {
          childNodes.splice(existingIdx, 1);
        }
        child.parentElement = el;
        child.parentNode = el;
        childNodes.push(child);
        if (child.nodeType === 1 && child.id) {
          idIndex.set(child.id, child);
        }
        return child;
      },
      insertBefore(child, refNode) {
        if (!refNode) {
          return el.appendChild(child);
        }
        if (child.parentNode && child.parentNode !== el) {
          child.parentNode.removeChild(child);
        }
        const refIdx = childNodes.indexOf(refNode);
        child.parentElement = el;
        child.parentNode = el;
        if (refIdx >= 0) {
          childNodes.splice(refIdx, 0, child);
        } else {
          childNodes.push(child);
        }
        return child;
      },
      removeChild(child) {
        const idx = childNodes.indexOf(child);
        if (idx < 0) {
          throw new Error("NotFoundError: Failed to execute 'removeChild'");
        }
        childNodes.splice(idx, 1);
        child.parentElement = null;
        child.parentNode = null;
        return child;
      },
      remove() {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const arr = listeners.get(type);
        if (!arr) return;
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      },
      dispatchEvent(ev) {
        ev.target = ev.target || el;
        const arr = listeners.get(ev.type) || [];
        for (const fn of arr.slice()) {
          fn(ev);
        }
        return true;
      },
      closest(selector) {
        let cur = el;
        while (cur && cur.nodeType === 1) {
          if (matchesAnySelector(cur, selector)) {
            return cur;
          }
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector.trim().startsWith(":scope >")) {
          const childSel = selector.trim().slice(":scope >".length).trim();
          return el.children.filter((c) => matchesAnySelector(c, childSel));
        }
        return walkDescendants(el).filter((node) => matchesAnySelector(node, selector));
      },
      querySelector(selector) {
        return el.querySelectorAll(selector)[0] || null;
      },
      getBBox() {
        const len = (el.textContent || "").length;
        return { x: 0, y: 0, width: Math.max(20, len * 8), height: 18 };
      },
      getComputedTextLength() {
        return (el.textContent || "").length * 8;
      },
      getContext() {
        return {
          measureText: (txt) => ({ width: String(txt || "").length * 8 }),
          fillRect() {},
          clearRect() {}
        };
      },
      classList: {
        add(...names) {
          names.forEach((n) => n && classSet.add(n));
          attrs.class = el.className;
        },
        remove(...names) {
          names.forEach((n) => classSet.delete(n));
          attrs.class = el.className;
        },
        toggle(name, force) {
          const shouldAdd = force === undefined ? !classSet.has(name) : Boolean(force);
          if (shouldAdd) {
            classSet.add(name);
          } else {
            classSet.delete(name);
          }
          attrs.class = el.className;
          return shouldAdd;
        },
        contains(name) {
          return classSet.has(name);
        }
      }
    };
    return el;
  }

  const localStore = new Map([[ "pybricks-locale", initialLocale ]]);
  const winListeners = new Map();

  const htmlEl = makeElement("html");
  const headEl = makeElement("head");
  const bodyEl = makeElement("body");
  const rootDiv = makeElement("div");
  rootDiv.id = "root";
  htmlEl.appendChild(headEl);
  htmlEl.appendChild(bodyEl);
  bodyEl.appendChild(rootDiv);

  const document = {
    readyState: "complete",
    documentElement: htmlEl,
    head: headEl,
    body: bodyEl,
    activeElement: bodyEl,
    styleSheets: [],
    hasFocus: () => true,
    queryCommandSupported: () => false,
    createElement: (tag) => makeElement(tag),
    createElementNS: (_ns, tag) => makeElement(tag),
    createTextNode: (txt) => makeTextNode(txt),
    createDocumentFragment: () => makeElement("fragment"),
    getElementById(id) {
      if (idIndex.has(id)) return idIndex.get(id);
      return htmlEl.querySelector(`#${id}`);
    },
    querySelector: (sel) => htmlEl.querySelector(sel),
    querySelectorAll: (sel) => htmlEl.querySelectorAll(sel),
    addEventListener() {},
    removeEventListener() {}
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    structuredClone,
    atob,
    btoa,
    fetch,
    URL,
    URLSearchParams,
    Blob,
    TextEncoder,
    TextDecoder,
    devicePixelRatio: 1,
    name: "pybricks-verify-win",
    performance: { now: () => Date.now(), mark() {}, measure() {}, getEntriesByName: () => [] },
    crypto: {
      getRandomValues: (arr) => arr,
      randomUUID: () => "00000000-0000-4000-8000-000000000000"
    },
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k)
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0",
      languages: [initialLocale, "en"],
      language: initialLocale,
      platform: "MacIntel",
      maxTouchPoints: 0,
      clipboard: {}
    },
    location: {
      href: "https://code.pybricks.com/",
      host: "code.pybricks.com",
      origin: "https://code.pybricks.com",
      protocol: "https:",
      pathname: "/",
      search: ""
    },
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {}
    }),
    getComputedStyle: () => ({
      fontSize: "12px",
      fontWeight: "400",
      fontFamily: "sans-serif",
      getPropertyValue: () => ""
    }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    CustomEvent: class CustomEvent {
      constructor(type, opts) {
        this.type = type;
        this.detail = opts && opts.detail;
      }
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    UIEvent: class UIEvent {},
    MouseEvent: class MouseEvent {},
    KeyboardEvent: class KeyboardEvent {},
    Element: class Element {},
    HTMLElement: class HTMLElement {},
    Node: class Node {},
    SVGElement: class SVGElement {},
    DocumentFragment: class DocumentFragment {},
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class ResizeObserver {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class IntersectionObserver {
      observe() {}
      disconnect() {}
    },
    DOMParser: class DOMParser {
      parseFromString() {
        return { documentElement: makeElement("xml") };
      }
    },
    XMLSerializer: class XMLSerializer {
      serializeToString() {
        return "<svg/>";
      }
    },
    Image: class Image {},
    Worker: class Worker {
      postMessage() {}
      terminate() {}
      addEventListener() {}
    },
    OffscreenCanvas: class OffscreenCanvas {},
    document,
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = winListeners.get(type);
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) {
      const arr = winListeners.get(ev.type) || [];
      for (const fn of arr.slice()) {
        fn(ev);
      }
      return true;
    },
    postMessage(data) {
      queueMicrotask(() => {
        sandbox.dispatchEvent({ type: "message", source: sandbox, data });
      });
    }
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, document, rootDiv, makeElement, makeTextNode, localStore };
}

function loadExtensionMainWorld(sandbox) {
  const files = [
    "locales/ui-catalog.js",
    "locales/blockly-std.js",
    "locales/blockly-pybricks.js",
    "src/page-engine.js"
  ];
  for (const relPath of files) {
    const absPath = path.join(PROJECT_ROOT, relPath);
    const code = fs.readFileSync(absPath, "utf8");
    vm.runInContext(code, sandbox, { filename: relPath });
  }
}

function loadPybricksWebpackRuntime(sandbox, bundleDir) {
  const mainJs = fs.readFileSync(path.join(bundleDir, "main.js"), "utf8");
  const varStart = mainJs.indexOf("var e={");
  const rtStart = mainJs.indexOf("},t={};function i(n){");
  assert(varStart >= 0 && rtStart > varStart, "Unexpected main.js Webpack module table layout");

  const mainModulesExpr = mainJs.slice(varStart + 6, rtStart + 1);
  vm.runInContext(
    `var __pbMainMods = ${mainModulesExpr}; self.webpackChunk_pybricks_pybricks_code.push([[179], __pbMainMods]);`,
    sandbox,
    { filename: "main-modules.js" }
  );

  for (const chunkFile of ["498.js", "8440.js", "8475.js", "4852.js", "5261.js"]) {
    const code = fs.readFileSync(path.join(bundleDir, chunkFile), "utf8");
    vm.runInContext(code, sandbox, { filename: chunkFile });
  }

  const allModules = {};
  for (const chunk of sandbox.webpackChunk_pybricks_pybricks_code) {
    if (chunk && chunk[1]) {
      Object.assign(allModules, chunk[1]);
    }
  }

  const moduleCache = {};
  function wreq(modId) {
    if (moduleCache[modId]) {
      return moduleCache[modId].exports;
    }
    const factory = allModules[modId];
    assert(typeof factory === "function", `Missing Webpack module ${modId}`);
    const mod = (moduleCache[modId] = { id: modId, loaded: false, exports: {} });
    factory.call(mod.exports, mod, mod.exports, wreq);
    mod.loaded = true;
    return mod.exports;
  }
  wreq.m = allModules;
  wreq.c = moduleCache;
  wreq.d = (exports, def) => {
    for (const k of Object.keys(def)) {
      if (!Object.prototype.hasOwnProperty.call(exports, k)) {
        Object.defineProperty(exports, k, { enumerable: true, get: def[k] });
      }
    }
  };
  wreq.n = (mod) => {
    const getter = mod && mod.__esModule ? () => mod.default : () => mod;
    wreq.d(getter, { a: getter });
    return getter;
  };
  wreq.nmd = (mod) => {
    mod.paths = [];
    if (!mod.children) mod.children = [];
    return mod;
  };
  wreq.o = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);
  wreq.r = (exports) => {
    Object.defineProperty(exports, "__esModule", { value: true });
  };
  wreq.g = sandbox;
  wreq.p = "/";
  wreq.b = "https://code.pybricks.com/";

  return {
    wreq,
    mainJs,
    c4852Js: fs.readFileSync(path.join(bundleDir, "4852.js"), "utf8"),
    c5261Js: fs.readFileSync(path.join(bundleDir, "5261.js"), "utf8")
  };
}

// ============================================================================
// Helper Extractors for Placeholder Validation
// ============================================================================

function extractCurlyPlaceholders(str) {
  return Array.from(new Set((String(str).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort()));
}

function extractBlocklyPercentTokens(str) {
  return Array.from(new Set((String(str).match(/%[1-9]\d*/g) || []).sort()));
}

function collectLeafPaths(obj, prefix = "", out = new Map()) {
  if (typeof obj === "string") {
    out.set(prefix, obj);
    return out;
  }
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const next = prefix ? `${prefix}.${k}` : k;
      collectLeafPaths(obj[k], next, out);
    }
  }
  return out;
}

/**
 * Extract all `{ id: "i18n_...", fallback: <moduleVar> }` registrations directly
 * from `main.js` and `4852.js` and resolve their exact English JSON fallback objects via `wreq`.
 */
function extractProductionI18nFallbacks(sources, wreq) {
  const result = new Map();

  for (const source of sources) {
    const idRegex = /id:"(i18n_[a-z0-9]+)",fallback:([A-Za-z_$][A-Za-z0-9_$]*)/g;
    for (const match of source.matchAll(idRegex)) {
      const [, i18nId, varName] = match;
      const lookback = source.slice(Math.max(0, match.index - 15000), match.index);
      const escapedVar = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reqMatches = [
        ...lookback.matchAll(
          new RegExp(`(?:^|[,;{ ])${escapedVar}=[a-zA-Z_$][\\w$]*\\((\\d+)\\)`, "g")
        )
      ];
      assert(reqMatches.length > 0, `Could not resolve fallback module ID for ${i18nId} (${varName})`);
      const webpackModId = Number(reqMatches[reqMatches.length - 1][1]);
      const fallbackJson = wreq(webpackModId);
      result.set(i18nId, fallbackJson);
    }
  }

  return result;
}

// ============================================================================
// SUITE 1: Manifest & Catalog Integrity + Placeholder Verification
// ============================================================================

function runSuite1(sandbox, prodFallbacks) {
  console.log("\n=== Suite 1: Extension Manifest, Catalog Coverage & Placeholder Parity ===");

  // 1.1 Verify Manifest V3 configuration & referenced files
  const manifestPath = path.join(PROJECT_ROOT, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.manifest_version, 3, "manifest_version must be 3");
  assert.equal(manifest.action.default_popup, "src/popup.html");
  assert(fs.existsSync(path.join(PROJECT_ROOT, manifest.action.default_popup)));

  const csMain = manifest.content_scripts.find((c) => c.world === "MAIN");
  const csIsolated = manifest.content_scripts.find((c) => c.world === "ISOLATED");
  assert(csMain && csMain.run_at === "document_start", "MAIN world content script must run at document_start");
  assert(csIsolated && csIsolated.run_at === "document_start", "ISOLATED world bridge must run at document_start");

  for (const scriptRel of [...csMain.js, ...csIsolated.js, ...(csIsolated.css || [])]) {
    assert(fs.existsSync(path.join(PROJECT_ROOT, scriptRel)), `Missing extension asset: ${scriptRel}`);
  }

  // 1.2 Verify all 46 production `@shopify/react-i18n` modules & 521 leaf paths
  assert.equal(prodFallbacks.size, 46, `Expected 46 i18n_* modules in production bundle, found ${prodFallbacks.size}`);
  const uiCatalog = sandbox.__PYBRICKS_I18N_UI_CATALOG__;

  let totalUiLeaves = 0;
  for (const [modId, prodFallback] of prodFallbacks.entries()) {
    const enLeaves = collectLeafPaths(prodFallback);
    totalUiLeaves += enLeaves.size;

    for (const loc of SUPPORTED_LOCALES) {
      const catMod = uiCatalog[loc] && uiCatalog[loc][modId];
      assert(catMod, `Missing UI catalog module ${modId} for locale ${loc}`);
      const locLeaves = collectLeafPaths(catMod);

      for (const [leafPath, enStr] of enLeaves.entries()) {
        const locStr = locLeaves.get(leafPath);
        assert.equal(
          typeof locStr,
          "string",
          `Missing UI leaf ${modId}.${leafPath} in locale ${loc}`
        );
        assert(locStr.length > 0, `Empty UI translation at ${modId}.${leafPath} in locale ${loc}`);

        const enVars = extractCurlyPlaceholders(enStr);
        const locVars = extractCurlyPlaceholders(locStr);
        assert.deepEqual(
          locVars,
          enVars,
          `Curly placeholder mismatch at ${modId}.${leafPath} (${loc}): expected ${enVars}, got ${locVars}`
        );
      }
    }
  }
  assert.equal(totalUiLeaves, 521, `Expected 521 UI leaf paths, verified ${totalUiLeaves}`);

  // 1.3 Verify 420 Standard Blockly + 504 Pybricks Custom Blockly keys across 4 languages
  const bkyStd = sandbox.__PYBRICKS_I18N_BKY_STD__;
  const bkyCustom = sandbox.__PYBRICKS_I18N_BKY_CUSTOM__;
  const stdEnKeys = Object.keys(bkyStd.en);
  const customEnKeys = Object.keys(bkyCustom.en);
  assert.equal(stdEnKeys.length, 420, `Expected 420 standard Blockly keys, got ${stdEnKeys.length}`);
  assert.equal(customEnKeys.length, 504, `Expected 504 custom Pybricks Blockly keys, got ${customEnKeys.length}`);

  for (const loc of SUPPORTED_LOCALES) {
    for (const k of stdEnKeys) {
      const enVal = bkyStd.en[k];
      const locVal = bkyStd[loc][k];
      assert.equal(typeof locVal, "string", `Missing BKY_STD[${loc}].${k}`);
      if (!k.endsWith("_HELPURL")) {
        assert.deepEqual(
          extractBlocklyPercentTokens(locVal),
          extractBlocklyPercentTokens(enVal),
          `%N token mismatch in BKY_STD[${loc}].${k}: "${locVal}" vs "${enVal}"`
        );
      }
    }

    for (const k of customEnKeys) {
      const enVal = bkyCustom.en[k];
      const locVal = bkyCustom[loc][k];
      assert.equal(typeof locVal, "string", `Missing BKY_CUSTOM[${loc}].${k}`);
      assert(locVal.length > 0, `Unexpected empty string in BKY_CUSTOM[${loc}].${k}`);
      assert.deepEqual(
        extractBlocklyPercentTokens(locVal),
        extractBlocklyPercentTokens(enVal),
        `%N token mismatch in BKY_CUSTOM[${loc}].${k}: "${locVal}" vs "${enVal}"`
      );
    }

    assert.equal(Object.keys(sandbox.__PYBRICKS_I18N_TOOLBOX_CATEGORIES__[loc]).length, 8);
    assert.equal(Object.keys(sandbox.__PYBRICKS_I18N_FLYOUT_LABELS__[loc]).length, 33);
  }
  assert.equal(Object.keys(sandbox.__PYBRICKS_I18N_MESSAGE0_UPGRADES__).length, 9);
  assert.equal(Object.keys(sandbox.__PYBRICKS_I18N_FIELD_LABELS__).length, 5);

  console.log(
    `  ✓ Verified 46 UI modules (${totalUiLeaves} leaf paths) + ${
      stdEnKeys.length + customEnKeys.length
    } Blockly keys × ${SUPPORTED_LOCALES.length} locales with 0 placeholder errors.`
  );
}

// ============================================================================
// SUITE 2: Live UI, Bridge & Blockly Hot-Switch Simulation
// ============================================================================

function createSimulatedShopifyI18nManager(sandbox, initialLocale) {
  const VMMap = vm.runInContext("Map", sandbox);
  function splitSubtags(locale) {
    const parts = String(locale).split("-");
    return parts.length > 1 ? [`${parts[0]}-${parts[1].toUpperCase()}`, parts[0]] : [locale];
  }

  return new (class SimulatedI18nManager {
    constructor(details) {
      this.translationGetters = new VMMap();
      this.fallbacks = new VMMap();
      this.translations = new VMMap();
      this.subscriptions = new VMMap();
      this.translationPromises = new VMMap();
      this.details = details;
    }

    register({ id, fallback }) {
      if (!this.fallbacks.has(id)) {
        this.fallbacks.set(id, fallback);
      }
      if (!this.translationGetters.has(id)) {
        this.setTranslations(id, () => undefined);
      }
    }

    setTranslations(id, getter) {
      this.translationGetters.set(id, getter);
      for (const sub of splitSubtags(this.details.locale)) {
        const key = `${id}__${sub}`;
        if (!this.translations.has(key)) {
          this.translations.set(key, getter(sub));
        }
      }
    }

    state(ids) {
      const subtags = splitSubtags(this.details.locale);
      const list = [];
      for (const id of ids) {
        for (const sub of subtags) {
          const hit = this.translations.get(`${id}__${sub}`);
          if (hit != null) {
            list.push(hit);
          }
        }
        const fb = this.fallbacks.get(id);
        if (fb != null) {
          list.push(fb);
        }
      }
      return { loading: false, translations: list };
    }

    subscribe(cb, ids) {
      this.subscriptions.set(cb, ids);
      return () => this.subscriptions.delete(cb);
    }

    update(nextDetails) {
      this.details = nextDetails;
      for (const [id, getter] of this.translationGetters.entries()) {
        this.setTranslations(id, getter);
      }
      for (const [cb, ids] of this.subscriptions.entries()) {
        cb(this.state(ids), this.details);
      }
    }
  })({ locale: initialLocale });
}

function runSuite2(env, prodFallbacks, Blockly) {
  console.log("\n=== Suite 2: Live Hot-Switch Simulation (UI + Fiber + 6 Blockly Hooks + Layer 3/4 + Bridge) ===");

  const { sandbox, document, rootDiv, makeElement } = env;
  const engine = sandbox.__PYBRICKS_I18N_ENGINE__;

  // 2.1 Simulate first-paint registration with zh-CN active + mount React Fiber `<I18nContext.Provider value={pM}>`
  engine.setLocale("zh-CN");
  const pM = createSimulatedShopifyI18nManager(sandbox, "zh-CN");
  for (const [modId, fb] of prodFallbacks.entries()) {
    pM.register({ id: modId, fallback: fb });
  }

  // Test version-resilient fallback synthesis for a brand-new unknown hash `i18n_future_v99`
  pM.register({
    id: "i18n_future_v99",
    fallback: {
      toolbar: {
        check: "Check syntax",
        restart: "Restart",
        firmwareErr: "Failed to fetch firmware from the server: {status}"
      }
    }
  });

  // Attach React 18 `__reactContainer$` Fiber tree onto `#root` (depth 2, matching main.js)
  rootDiv.__reactContainer$verify = {
    child: {
      memoizedProps: { store: {} },
      child: {
        memoizedProps: { value: pM },
        child: null
      }
    }
  };

  let latestEditorTranslations = pM.state(["i18n_12zlqvz"]).translations;
  let latestFutureTranslations = pM.state(["i18n_future_v99"]).translations;
  pM.subscribe((st) => {
    latestEditorTranslations = st.translations;
  }, ["i18n_12zlqvz"]);
  pM.subscribe((st) => {
    latestFutureTranslations = st.translations;
  }, ["i18n_future_v99"]);

  assert.equal(latestEditorTranslations[0].check, "检查语法", "Zero-FOUC zh-CN first paint failed");
  assert.equal(latestFutureTranslations[0].toolbar.check, "检查语法", "Version-resilient fallback synthesis failed");
  assert.equal(
    latestFutureTranslations[0].toolbar.firmwareErr,
    "从服务器下载固件失败：{status}",
    "Version-resilient parameterized leaf synthesis failed"
  );

  // 2.2 Prepare Layer 3 whitelisted DOM nodes AND Layer 4 blacklisted nodes
  const searchContainer = makeElement("div");
  searchContainer.className = "rct-tree-search-input-container";
  const searchInput = makeElement("input");
  searchInput.className = "rct-tree-search-input";
  searchInput.placeholder = "Search...";
  searchContainer.appendChild(searchInput);
  rootDiv.appendChild(searchContainer);

  const modeBtn = makeElement("button");
  modeBtn.className = "pb-telemetry-mode-button";
  modeBtn.setAttribute("title", "reflection");
  modeBtn.setAttribute("aria-label", "reflection");
  rootDiv.appendChild(modeBtn);

  const hubBtn = makeElement("button");
  hubBtn.className = "pb-hub-button";
  hubBtn.setAttribute("aria-label", "SPIKE Prime Hub");
  const hubImg = makeElement("img");
  hubImg.setAttribute("title", "SPIKE Prime Hub");
  hubBtn.appendChild(hubImg);
  rootDiv.appendChild(hubBtn);

  const subtitleSpan = makeElement("span");
  subtitleSpan.className = "pb-telemetry-dialog-subtitle";
  subtitleSpan.appendChild(document.createTextNode("SPIKE Prime Hub"));
  subtitleSpan.appendChild(document.createTextNode(" · v3.6.0"));
  rootDiv.appendChild(subtitleSpan);

  const settingsPane = makeElement("div");
  settingsPane.className = "pb-settings";
  const appearanceGroup = makeElement("div");
  appearanceGroup.className = "bp5-form-group";
  settingsPane.appendChild(appearanceGroup);
  rootDiv.appendChild(settingsPane);

  // Layer 4 Blacklisted DOM zones (Monaco Python code, REPL terminal, user filenames, editable block field)
  const monacoZone = makeElement("div");
  monacoZone.className = "monaco-editor";
  const monacoLine = makeElement("span");
  monacoLine.textContent = "reflection = color_sensor.reflection() # Search... Back Next";
  monacoZone.appendChild(monacoLine);
  rootDiv.appendChild(monacoZone);

  const replZone = makeElement("div");
  replZone.className = "pb-terminal xterm";
  replZone.textContent = "SPIKE Prime Hub reflection score calibrate";
  rootDiv.appendChild(replZone);

  const fileItemBtn = makeElement("button");
  fileItemBtn.className = "rct-tree-item-button";
  fileItemBtn.textContent = "reflection.py";
  rootDiv.appendChild(fileItemBtn);

  // 2.3 Verify continuous live hot-switching: en -> zh-CN -> es -> nl -> en
  const EXPECTED_BY_LOCALE = {
    en: {
      check: "Check syntax",
      search: "Search...",
      reflection: "reflection",
      hub: "SPIKE Prime Hub",
      catSetup: "Setup",
      flyoutDrive: "Drive Base",
      listWith: "list with",
      rangeSteps: "with steps of",
      stopHoldText: "hold",
      stopHoldDesc: "hold this position"
    },
    "zh-CN": {
      check: "检查语法",
      search: "搜索文件…",
      reflection: "反射光",
      hub: "SPIKE Prime 科创集线器",
      catSetup: "配置",
      flyoutDrive: "驾驶底座",
      listWith: "列表包含",
      rangeSteps: "步长为",
      stopHoldText: "保持位置",
      stopHoldDesc: "锁定并保持当前角度位置"
    },
    es: {
      check: "Comprobar sintaxis",
      search: "Buscar archivos…",
      reflection: "luz reflejada",
      hub: "Hub SPIKE Prime",
      catSetup: "Configuración",
      flyoutDrive: "Base motriz",
      listWith: "lista con",
      rangeSteps: "con paso",
      stopHoldText: "mantener posición",
      stopHoldDesc: "mantener esta posición activa"
    },
    nl: {
      check: "Syntaxis controleren",
      search: "Bestanden zoeken…",
      reflection: "reflectie",
      hub: "SPIKE Prime Hub",
      catSetup: "Instellen",
      flyoutDrive: "Rijbasis",
      listWith: "lijst met",
      rangeSteps: "met stap",
      stopHoldText: "vasthouden",
      stopHoldDesc: "houd deze positie vast"
    }
  };

  for (const loc of ["en", "zh-CN", "es", "nl", "en"]) {
    engine.setLocale(loc);
    // Trigger `Blockly.setLocale({})` just like Pybricks `vs(loc)` does when rebuilding workspace
    Blockly.setLocale({});

    const exp = EXPECTED_BY_LOCALE[loc];

    // Layer 1 assertions
    assert.equal(pM.details.locale, loc, `Fiber pM.details.locale did not update to ${loc}`);
    assert.equal(latestEditorTranslations[0].check, exp.check, `UI check label mismatch in ${loc}`);

    // Layer 2 assertions:
    // (a) `gs` empty C-block labels preserved
    assert.equal(Blockly.Msg.CONTROLS_REPEAT_INPUT_DO, "", `CONTROLS_REPEAT_INPUT_DO not empty in ${loc}`);
    assert.equal(Blockly.Msg.CONTROLS_IF_MSG_THEN, "", `CONTROLS_IF_MSG_THEN not empty in ${loc}`);

    // (b) ToolboxCategory display label localized while internal name remains "Setup"
    const fakeCat = Object.create(Blockly.ToolboxCategory.prototype);
    fakeCat.name_ = "Setup";
    fakeCat.cssConfig_ = {};
    fakeCat.getId = () => "cat-setup";
    const catSpan = fakeCat.createLabelDom_("Setup");
    assert.equal(catSpan.textContent, exp.catSetup, `ToolboxCategory label mismatch in ${loc}`);
    assert.equal(fakeCat.name_, "Setup", `ToolboxCategory internal name_ was mutated!`);

    // (c) FlyoutButton header text localized before bbox measurement
    const fakeFlyoutWorkspace = {
      RTL: false,
      getCanvas: () => makeElement("g"),
      getThemeManager: () => ({ subscribe() {} })
    };
    const flyoutHeader = new Blockly.FlyoutButton(
      fakeFlyoutWorkspace,
      fakeFlyoutWorkspace,
      { text: "Drive Base" },
      true
    );
    flyoutHeader.createDom();
    assert.equal(flyoutHeader.text, exp.flyoutDrive, `FlyoutButton label mismatch in ${loc}`);

    // (d) Plain non-serializable FieldLabel mutator labels localized, while Serializable labels stay untouched!
    const mutatorLabel = new Blockly.FieldLabel("list with");
    assert.equal(mutatorLabel.getValue(), exp.listWith, `FieldLabel("list with") mismatch in ${loc}`);
    mutatorLabel.setValue("with steps of");
    assert.equal(mutatorLabel.getValue(), exp.rangeSteps, `FieldLabel("with steps of") mismatch in ${loc}`);

    const serializableParam = new Blockly.FieldLabelSerializable("from");
    assert.equal(
      serializableParam.getValue(),
      "from",
      `CRITICAL: FieldLabelSerializable("from") was mutated in ${loc}!`
    );
    const readonlyVarField = Blockly.fieldRegistry.fromJson({
      type: "field_var_readonly",
      nameOnToolbox: "to"
    });
    assert.equal(
      readonlyVarField.getValue(),
      "to",
      `CRITICAL: field_var_readonly("to") was mutated in ${loc}!`
    );

    // (e) `field_dropdown_more_details` dynamically resolves display & menu descriptions while keeping internal enum value
    const stopDropdown = Blockly.fieldRegistry.fromJson({
      type: "field_dropdown_more_details",
      menu: [
        ["Stop.COAST", "STOP_COAST_DESCRIPTION"],
        ["Stop.BRAKE", "STOP_BRAKE_DESCRIPTION"],
        ["Stop.HOLD", "STOP_HOLD_DESCRIPTION"]
      ]
    });
    stopDropdown.setValue("Stop.HOLD");
    assert.equal(stopDropdown.getValue(), "Stop.HOLD", "Dropdown internal enum value must remain Stop.HOLD");
    assert.equal(stopDropdown.getText(), exp.stopHoldText, `Dropdown chip text mismatch in ${loc}`);
    const openMenuItems = stopDropdown.getOptions(false);
    const holdOption = openMenuItems.find((opt) => opt[1] === "Stop.HOLD");
    assert.equal(holdOption[0], exp.stopHoldDesc, `Dropdown open menu description mismatch in ${loc}`);

    // Layer 3 assertions
    assert.equal(searchInput.placeholder, exp.search);
    assert.equal(modeBtn.getAttribute("title"), exp.reflection);
    assert.equal(hubBtn.getAttribute("aria-label"), exp.hub);
    assert.equal(hubImg.getAttribute("title"), exp.hub);
    assert.equal(subtitleSpan.firstChild.nodeValue, exp.hub);
    assert.equal(subtitleSpan.childNodes[1].nodeValue, " · v3.6.0");

    const settingsSelect = settingsPane.querySelector("#pb-i18n-language-select");
    assert(settingsSelect, "Settings language <select> was not injected into .pb-settings");
    assert.equal(settingsSelect.value, loc);

    const quickPill = document.getElementById("pb-i18n-quick-switcher");
    assert(quickPill, "Floating quick-switch pill was not mounted");

    // Layer 4 Blacklist assertions
    assert.equal(
      monacoLine.textContent,
      "reflection = color_sensor.reflection() # Search... Back Next",
      "CRITICAL: Monaco code line was modified!"
    );
    assert.equal(
      replZone.textContent,
      "SPIKE Prime Hub reflection score calibrate",
      "CRITICAL: REPL terminal text was modified!"
    );
    assert.equal(fileItemBtn.textContent, "reflection.py", "CRITICAL: User .py filename was modified!");
  }

  // 2.4 Verify ISOLATED-world `content-bridge.js` <-> `page-engine.js` communication
  const chromeStore = { pybricksLocale: "es", quickPillHidden: true };
  let runtimeMessageListener = null;
  sandbox.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(fn) {
          runtimeMessageListener = fn;
        }
      }
    },
    storage: {
      sync: {
        get(keys, cb) {
          cb({ ...chromeStore });
        },
        set(patch, cb) {
          Object.assign(chromeStore, patch);
          if (cb) cb();
        }
      },
      onChanged: { addListener() {} }
    }
  };

  const bridgeCode = fs.readFileSync(path.join(PROJECT_ROOT, "src/content-bridge.js"), "utf8");
  vm.runInContext(bridgeCode, sandbox, { filename: "src/content-bridge.js" });

  assert.equal(engine.getLocale(), "es", "content-bridge initial sync from chrome.storage.sync failed");
  assert.equal(engine.isQuickPillHidden(), true, "content-bridge quickPillHidden sync failed");

  let popupResp = null;
  runtimeMessageListener({ type: "PYBRICKS_I18N_SET_LOCALE", locale: "zh-CN" }, {}, (resp) => {
    popupResp = resp;
  });
  assert(popupResp && popupResp.ok && popupResp.locale === "zh-CN");
  assert.equal(engine.getLocale(), "zh-CN", "Popup message failed to hot-switch page-engine");
  assert.equal(chromeStore.pybricksLocale, "zh-CN", "Popup message failed to persist to chrome.storage");

  console.log(
    `  ✓ Passed full en -> zh-CN -> es -> nl -> en hot-switch across Fiber I18nManager, 6 Blockly hooks, Layer 3 DOM & Content Bridge.`
  );
}

// ============================================================================
// SUITE 3: Python Code Byte-for-Byte Identity Proof (`workspaceToCode`)
// ============================================================================

/**
 * Build a comprehensive, realistic Pybricks robotics Blockly workspace JSON AST covering:
 *   - PrimeHub setup (`prime_hub`)
 *   - Smart Motors (`left_motor` on Port A CCW, `right_motor` on Port B CW)
 *   - DriveBase (`drive_base` with 56mm wheel diameter & 112mm axle track)
 *   - ColorSensor (`color_sensor` on Port C) & ForceSensor (`force_sensor` on Port D)
 *   - Global Variable (`speed_limit` = 300) & List (`waypoints` = [100, 200, 300])
 *   - Custom Task (`check_bumper`) + Multitask (`all`) + For/Range(`from 0 to 4 step 1`)
 *   - If/Else sensor checks + DriveBase straight move (`Stop.HOLD`) + Motor run + Wait + Print
 */
function buildComprehensiveRoboticsProjectJson() {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "blockGlobalSetup",
          id: "setup_root",
          x: 80,
          y: 60,
          deletable: false,
          next: {
            block: {
              type: "variables_set_prime_hub",
              id: "setup_hub",
              fields: {
                VAR: { id: "var_hub", name: "prime_hub", type: "PrimeHub" }
              },
              next: {
                block: {
                  type: "variables_set_motor",
                  id: "setup_left_motor",
                  fields: {
                    VAR: { id: "var_left", name: "left_motor", type: "Motor" }
                  },
                  inputs: {
                    PORT: {
                      shadow: { type: "blockParametersPort", id: "port_a", fields: { NAME: "A" } }
                    },
                    POSITIVE_DIRECTION: {
                      shadow: {
                        type: "blockParametersDirection",
                        id: "dir_ccw",
                        fields: { SELECTION: "Direction.COUNTERCLOCKWISE" }
                      }
                    }
                  },
                  next: {
                    block: {
                      type: "variables_set_motor",
                      id: "setup_right_motor",
                      fields: {
                        VAR: { id: "var_right", name: "right_motor", type: "Motor" }
                      },
                      inputs: {
                        PORT: {
                          shadow: { type: "blockParametersPort", id: "port_b", fields: { NAME: "B" } }
                        },
                        POSITIVE_DIRECTION: {
                          shadow: {
                            type: "blockParametersDirection",
                            id: "dir_cw",
                            fields: { SELECTION: "Direction.CLOCKWISE" }
                          }
                        }
                      },
                      next: {
                        block: {
                          type: "variables_set_drive_base",
                          id: "setup_db",
                          fields: {
                            VAR: { id: "var_db", name: "drive_base", type: "DriveBase" }
                          },
                          inputs: {
                            VAR: {
                              shadow: {
                                type: "variables_get_motor_device",
                                id: "get_left",
                                fields: { VAR: { id: "var_left", name: "left_motor", type: "Motor" } }
                              }
                            },
                            VAR2: {
                              shadow: {
                                type: "variables_get_motor_device",
                                id: "get_right",
                                fields: { VAR: { id: "var_right", name: "right_motor", type: "Motor" } }
                              }
                            },
                            VALUE0: {
                              shadow: { type: "unit_distance", id: "wheel_d", fields: { VALUE0: 56 } }
                            },
                            VALUE1: {
                              shadow: { type: "unit_distance", id: "axle_t", fields: { VALUE0: 112 } }
                            }
                          },
                          next: {
                            block: {
                              type: "variables_set_color_sensor",
                              id: "setup_color",
                              fields: {
                                VAR: { id: "var_color", name: "color_sensor", type: "ColorSensor" }
                              },
                              inputs: {
                                PORT: {
                                  shadow: { type: "blockParametersPort", id: "port_c", fields: { NAME: "C" } }
                                }
                              },
                              next: {
                                block: {
                                  type: "variables_set_force_sensor",
                                  id: "setup_force",
                                  fields: {
                                    VAR: { id: "var_force", name: "force_sensor", type: "ForceSensor" }
                                  },
                                  inputs: {
                                    PORT: {
                                      shadow: { type: "blockParametersPort", id: "port_d", fields: { NAME: "D" } }
                                    }
                                  },
                                  next: {
                                    block: {
                                      type: "variables_setup_any",
                                      id: "setup_var_list",
                                      fields: {
                                        VAR: { id: "var_waypoints", name: "waypoints", type: "Any" }
                                      },
                                      inputs: {
                                        VALUE0: {
                                          block: {
                                            type: "blockListCreate",
                                            id: "list_create_3",
                                            extraState: { optionLevel: 3 },
                                            inputs: {
                                              ADD0: {
                                                block: { type: "blockMathNumber", id: "n100", fields: { NUM: 100 } }
                                              },
                                              ADD1: {
                                                block: { type: "blockMathNumber", id: "n200", fields: { NUM: 200 } }
                                              },
                                              ADD2: {
                                                block: { type: "blockMathNumber", id: "n300", fields: { NUM: 300 } }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          type: "blockGlobalStart",
          id: "start_root",
          x: 80,
          y: 420,
          deletable: false,
          next: {
            block: {
              type: "blockMultiTask",
              id: "multitask_1",
              extraState: { optionLevel: 0 },
              fields: { METHOD: "MULTITASK_ALL" },
              inputs: {
                TASK0: {
                  block: {
                    type: "blockDriveBaseMove",
                    id: "db_move_1",
                    extraState: { optionLevel: 1 },
                    fields: { METHOD: "DRIVEBASE_MOVE_STRAIGHT" },
                    inputs: {
                      VAR: {
                        shadow: {
                          type: "variables_get_drive_base_device",
                          id: "db_ref_1",
                          fields: { VAR: { id: "var_db", name: "drive_base", type: "DriveBase" } }
                        }
                      },
                      ARG0: {
                        shadow: { type: "unit_distance", id: "dist_250", fields: { VALUE0: 250 } }
                      },
                      THEN: {
                        shadow: { type: "parameters_stop_4", id: "stop_coast_1", fields: { VALUE: "Stop.COAST" } }
                      }
                    }
                  }
                },
                TASK1: {
                  block: {
                    type: "blockMotorRun",
                    id: "motor_run_1",
                    extraState: { optionLevel: 1 },
                    fields: { METHOD: "MOTOR_RUN_FOR" },
                    inputs: {
                      VAR: {
                        shadow: {
                          type: "variables_get_motor_device",
                          id: "m_ref_1",
                          fields: { VAR: { id: "var_left", name: "left_motor", type: "Motor" } }
                        }
                      },
                      VALUE0: {
                        shadow: { type: "unit_angularVelocity", id: "spd_500", fields: { VALUE0: 500 } }
                      },
                      ANGLE: {
                        shadow: { type: "unit_angle", id: "ang_180", fields: { VALUE0: 180 } }
                      },
                      THEN: {
                        shadow: { type: "parameters_stop_4", id: "stop_brake_1", fields: { VALUE: "Stop.BRAKE" } }
                      }
                    }
                  }
                }
              },
              next: {
                block: {
                  type: "blockFlowForEach",
                  id: "for_loop_1",
                  inputs: {
                    VAR: {
                      shadow: {
                        type: "variables_setup_iterable",
                        id: "iter_i",
                        fields: { VAR: { id: "var_iter_i", name: "step_idx", type: "LoopVariable" } }
                      }
                    },
                    LIST: {
                      block: {
                        type: "blockRange",
                        id: "range_opts_1",
                        extraState: { optionLevel: 1 },
                        inputs: {
                          RANGE_FROM: {
                            shadow: { type: "blockMathNumber", id: "r_from", fields: { NUM: 0 } }
                          },
                          RANGE_TO: {
                            shadow: { type: "blockMathNumber", id: "r_to", fields: { NUM: 4 } }
                          },
                          RANGE_STEPS: {
                            shadow: { type: "blockMathNumber", id: "r_step", fields: { NUM: 1 } }
                          }
                        }
                      }
                    },
                    DO: {
                      block: {
                        type: "blockIfElse",
                        id: "if_sensor_1",
                        extraState: { optionLevel: 1 },
                        inputs: {
                          IF0: {
                            block: {
                              type: "blockLogicCompare",
                              id: "cmp_1",
                              fields: { OP1: "GT" },
                              inputs: {
                                A: {
                                  block: {
                                    type: "blockLightReflection",
                                    id: "refl_read_1",
                                    inputs: {
                                      VAR: {
                                        shadow: {
                                          type: "variables_get_light_intensity_device",
                                          id: "c_ref_1",
                                          fields: {
                                            VAR: { id: "var_color", name: "color_sensor", type: "ColorSensor" }
                                          }
                                        }
                                      }
                                    }
                                  }
                                },
                                B: {
                                  shadow: { type: "blockMathNumber", id: "thr_50", fields: { NUM: 50 } }
                                }
                              }
                            }
                          },
                          DO0: {
                            block: {
                              type: "blockPrint",
                              id: "print_1",
                              extraState: { optionLevel: 0 },
                              inputs: {
                                TEXT0: {
                                  shadow: {
                                    type: "text",
                                    id: "txt_lit_1",
                                    fields: { TEXT: "Line detected! Keep English literal" }
                                  }
                                }
                              }
                            }
                          },
                          ELSE: {
                            block: {
                              type: "blockWaitTime",
                              id: "wait_100",
                              inputs: {
                                VALUE0: {
                                  shadow: { type: "unit_time", id: "t_100", fields: { VALUE0: 100 } }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  next: {
                    block: {
                      type: "blockVariableSetValue",
                      id: "set_waypoints_empty",
                      inputs: {
                        VAR: {
                          shadow: {
                            type: "variables_get_any",
                            id: "get_wp",
                            fields: { VAR: { id: "var_waypoints", name: "waypoints", type: "Any" } }
                          }
                        },
                        VALUE0: {
                          block: {
                            type: "blockListCreate",
                            id: "list_empty_end",
                            extraState: { optionLevel: 0 }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      ]
    },
    variables: [
      { id: "var_hub", name: "prime_hub", type: "PrimeHub" },
      { id: "var_left", name: "left_motor", type: "Motor" },
      { id: "var_right", name: "right_motor", type: "Motor" },
      { id: "var_db", name: "drive_base", type: "DriveBase" },
      { id: "var_color", name: "color_sensor", type: "ColorSensor" },
      { id: "var_force", name: "force_sensor", type: "ForceSensor" },
      { id: "var_waypoints", name: "waypoints", type: "Any" },
      { id: "var_iter_i", name: "step_idx", type: "LoopVariable" }
    ]
  };
}

function runSuite3(sandbox, Blockly, pybricksGenerator) {
  console.log("\n=== Suite 3: Byte-for-Byte Python Code Identity & AST Invariance Proof ===");

  const engine = sandbox.__PYBRICKS_I18N_ENGINE__;
  const seedJson = buildComprehensiveRoboticsProjectJson();

  // First materialize a canonical saved workspace snapshot (just like Pybricks saving an `.py` block file)
  engine.setLocale("en");
  Blockly.setLocale({});
  const initWs = new Blockly.Workspace();
  initWs.isDragging = () => false;
  Blockly.Events.disable();
  let canonicalProjectJson;
  try {
    Blockly.serialization.workspaces.load(seedJson, initWs);
    canonicalProjectJson = Blockly.serialization.workspaces.save(initWs);
    initWs.dispose();
  } finally {
    Blockly.Events.enable();
  }

  const codeByLocale = new Map();
  const astByLocale = new Map();
  const blockSummariesByLocale = new Map();

  for (const loc of SUPPORTED_LOCALES) {
    engine.setLocale(loc);
    Blockly.setLocale({});

    const workspace = new Blockly.Workspace();
    workspace.isDragging = () => false;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(canonicalProjectJson, workspace);
    } finally {
      Blockly.Events.enable();
    }

    // Capture human-visible block string representations (`block.toString()`) to prove blocks localized!
    const colorBlock = workspace.getBlockById("setup_color");
    const rangeBlock = workspace.getBlockById("range_opts_1");
    const listBlock = workspace.getBlockById("list_create_3");
    const multitaskBlock = workspace.getBlockById("multitask_1");
    blockSummariesByLocale.set(loc, {
      colorSetup: colorBlock.toString(),
      rangeText: rangeBlock.toString(),
      listText: listBlock.toString(),
      multitaskText: multitaskBlock.toString()
    });

    const pythonCode = pybricksGenerator.workspaceToCode(workspace);
    const savedAst = JSON.stringify(Blockly.serialization.workspaces.save(workspace));

    codeByLocale.set(loc, pythonCode);
    astByLocale.set(loc, savedAst);
    Blockly.Events.disable();
    try {
      workspace.dispose();
    } finally {
      Blockly.Events.enable();
    }
  }

  const baselinePython = codeByLocale.get("en");
  const baselineAst = astByLocale.get("en");

  // Verify the generated MicroPython contains all expected real Pybricks constructs & literals
  assert(baselinePython.includes("from pybricks.hubs import PrimeHub"), "Missing PrimeHub import");
  assert(baselinePython.includes("from pybricks.pupdevices import ColorSensor, ForceSensor, Motor") || baselinePython.includes("ColorSensor"), "Missing sensor/motor imports");
  assert(baselinePython.includes("from pybricks.robotics import DriveBase"), "Missing DriveBase import");
  assert(baselinePython.includes("multitask"), "Missing multitask coroutine call");
  assert(baselinePython.includes("Stop.COAST"), "Missing Stop.COAST parameter");
  assert(baselinePython.includes("Stop.BRAKE"), "Missing Stop.BRAKE parameter");
  assert(baselinePython.includes("range(0, 4, 1)"), "Missing range(0, 4, 1) call");
  assert(baselinePython.includes("'Line detected! Keep English literal'"), "User string literal must remain intact");

  // Verify visible block text genuinely localized across languages
  assert(
    blockSummariesByLocale.get("zh-CN").colorSetup.includes("连接端口") &&
      blockSummariesByLocale.get("zh-TW").colorSetup.includes("連接埠") &&
      blockSummariesByLocale.get("es").colorSetup.includes("en puerto") &&
      blockSummariesByLocale.get("nl").colorSetup.includes("op"),
    `Setup block visible text did not localize: ${JSON.stringify(Object.fromEntries(blockSummariesByLocale))}`
  );
  assert(
    blockSummariesByLocale.get("zh-CN").rangeText.includes("步长为") &&
      (blockSummariesByLocale.get("zh-TW").rangeText.includes("間隔為") ||
        blockSummariesByLocale.get("zh-TW").rangeText.includes("步長為")) &&
      blockSummariesByLocale.get("es").rangeText.includes("con paso") &&
      blockSummariesByLocale.get("nl").rangeText.includes("met stap"),
    `Range mutator FieldLabels did not localize: ${JSON.stringify(Object.fromEntries(blockSummariesByLocale))}`
  );

  // CORE RED-LINE ASSERTION: 100% byte-for-byte Python & JSON AST identity across en, zh-CN, zh-TW, es, nl!
  for (const loc of ["zh-CN", "zh-TW", "es", "nl"]) {
    assert.equal(
      codeByLocale.get(loc),
      baselinePython,
      `CRITICAL RED-LINE FAILURE: Generated Python code in "${loc}" differs from "en"!`
    );
    assert.equal(
      astByLocale.get(loc),
      baselineAst,
      `Serialized Blockly JSON AST in "${loc}" differs from "en"!`
    );
  }

  console.log("  ✓ Blockly surface text verified across EN / 简中 / 繁中 / ES / NL:");
  for (const loc of SUPPORTED_LOCALES) {
    const s = blockSummariesByLocale.get(loc);
    console.log(`    [${loc.padEnd(5)}] ${s.colorSetup} | ${s.rangeText} | ${s.multitaskText}`);
  }
  console.log(
    `  ✓ Generated MicroPython (${Buffer.byteLength(
      baselinePython,
      "utf8"
    )} bytes) & JSON AST are 100% BYTE-FOR-BYTE IDENTICAL across en, zh-CN, zh-TW, es, nl!`
  );
}

// ============================================================================
// Main Runner
// ============================================================================

async function main() {
  const startMs = Date.now();
  const bundleDir = await ensureProductionBundles();
  const env = createDomEnvironment("zh-CN");

  // 1. Load our extension MAIN-world catalogs + engine at simulated `document_start`
  loadExtensionMainWorld(env.sandbox);

  // 2. Load real `code.pybricks.com` Webpack chunks & capture Pybricks `pythonGenerator`
  const { wreq, mainJs, c4852Js, c5261Js } = loadPybricksWebpackRuntime(env.sandbox, bundleDir);
  const Blockly = wreq(85341);
  const pyMod = wreq(81079);

  let pybricksGenerator = null;
  const proto = Object.getPrototypeOf(pyMod.pythonGenerator);
  const origAddReserved = proto.addReservedWords;
  proto.addReservedWords = function (...args) {
    if (String(args[0]).includes("multitask")) {
      pybricksGenerator = this;
    }
    return origAddReserved.apply(this, args);
  };

  wreq(24647);
  assert(pybricksGenerator, "Failed to capture Pybricks pythonGenerator singleton (`ke`) from 4852.js");

  // Also verify all 34 `Ss` operator symbols & any SVG data URIs are preserved
  const EXPECTED_SS_KEYS = [
    "GTE", "LTE", "NEQ", "GT", "LT", "EQ",
    "SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN", "ATAN2",
    "ROOT", "ABS", "NEG", "LN", "LOG10", "EXP", "POW10",
    "MIN", "MAX", "ROUND", "ROUNDUP", "ROUNDDOWN", "MODULO",
    "ADD", "MINUS", "MULTIPLY", "DIVIDE", "POWER",
    "SEP_COMMA_ONLY", "SEP_COMMA_SPACE", "SEP_SPACE"
  ];
  // Also inject a synthetic `data:image/svg+xml` icon into Blockly.Msg to verify SVG URI protection
  Blockly.Msg.__TEST_SVG_ICON__ = "data:image/svg+xml;base64,PHN2Zy8+";
  const initialSsSnapshot = new Map(EXPECTED_SS_KEYS.map((k) => [k, Blockly.Msg[k]]));
  assert.equal(initialSsSnapshot.size, 34);
  for (const [k, v] of initialSsSnapshot.entries()) {
    assert(typeof v === "string" && v.length > 0, `Missing Ss operator symbol ${k}`);
  }

  const prodFallbacks = extractProductionI18nFallbacks([mainJs, c4852Js, c5261Js], wreq);

  // Execute all 3 verification suites
  runSuite1(env.sandbox, prodFallbacks);
  runSuite2(env, prodFallbacks, Blockly);
  runSuite3(env.sandbox, Blockly, pybricksGenerator);

  // Re-verify all 34 `Ss` operator symbols + SVG data URI are still intact after all hot-switches!
  for (const [opKey, opVal] of initialSsSnapshot.entries()) {
    assert.equal(
      Blockly.Msg[opKey],
      opVal,
      `Operator symbol ${opKey} was corrupted after hot-switches!`
    );
  }
  assert.equal(
    Blockly.Msg.__TEST_SVG_ICON__,
    "data:image/svg+xml;base64,PHN2Zy8+",
    "SVG data URI icon in Blockly.Msg was overwritten!"
  );

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
  console.log(`\nALL VERIFICATION SUITES PASSED (${elapsed}s) — ZERO ERRORS.\n`);
}

main().catch((err) => {
  console.error("\nVERIFICATION FAILED:", err);
  process.exit(1);
});
