#!/usr/bin/env node
/**
 * Zero-dependency compiler and validator for Pybricks Code multi-language bundles.
 * Single Source of Truth (SSOT): locales/<locale>.csv + locales/schema.json.
 * 
 * Usage:
 *   node scripts/build-locales.mjs
 */

import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "locales");
const SCHEMA_FILE = path.join(LOCALES_DIR, "schema.json");

// ============================================================================
// RFC-4180 CSV Parser & Serializer with UTF-8 BOM support
// ============================================================================

export function parseCsv(rawContent) {
  let content = rawContent;
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < len && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        continue;
      } else if (ch === "\r") {
        if (i + 1 < len && content[i + 1] === "\n") {
          i++;
        }
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else if (ch === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += ch;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

export function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ============================================================================
// Placeholder Extractors & Tree Synthesizers
// ============================================================================

export function extractBlocklyPercentTokens(str) {
  return Array.from(new Set((String(str).match(/%[1-9]\d*/g) || []).sort()));
}

export function extractCurlyPlaceholders(str) {
  return Array.from(new Set((String(str).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort()));
}

export function synthesizeUiTree(enNode, fullPath, overrides, uiStrings) {
  if (typeof enNode === "string") {
    if (overrides && typeof overrides[fullPath] === "string") {
      return overrides[fullPath];
    }
    if (uiStrings && typeof uiStrings[enNode] === "string") {
      return uiStrings[enNode];
    }
    return enNode;
  }
  if (Array.isArray(enNode)) {
    return enNode.map((item, idx) =>
      synthesizeUiTree(item, `${fullPath}.${idx}`, overrides, uiStrings)
    );
  }
  if (enNode && typeof enNode === "object") {
    const out = {};
    for (const [k, v] of Object.entries(enNode)) {
      const nextPath = fullPath ? `${fullPath}.${k}` : k;
      out[k] = synthesizeUiTree(v, nextPath, overrides, uiStrings);
    }
    return out;
  }
  return enNode;
}

export function unflattenDomPatches(entries) {
  const result = {};
  for (const [key, val] of entries) {
    const dotIdx = key.indexOf(".");
    if (dotIdx === -1) {
      result[key] = val;
    } else {
      const parent = key.slice(0, dotIdx);
      const child = key.slice(dotIdx + 1);
      if (!result[parent] || typeof result[parent] !== "object") {
        result[parent] = {};
      }
      result[parent][child] = val;
    }
  }
  return result;
}

// ============================================================================
// Main Build & Verification Logic
// ============================================================================

export async function buildLocales() {
  console.log("Reading schema from:", SCHEMA_FILE);
  if (!fs.existsSync(SCHEMA_FILE)) {
    throw new Error(`Schema file not found at ${SCHEMA_FILE}`);
  }
  const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));

  // Discover all CSV files in locales directory
  const csvFiles = fs
    .readdirSync(LOCALES_DIR)
    .filter((file) => file.endsWith(".csv"))
    .map((file) => file.replace(/\.csv$/, ""));

  const PREFERRED_ORDER = ["en", "zh-CN", "zh-TW", "es", "nl"];
  const orderedLocales = [
    ...PREFERRED_ORDER.filter((loc) => csvFiles.includes(loc)),
    ...csvFiles.filter((loc) => !PREFERRED_ORDER.includes(loc)).sort()
  ];

  console.log(`Discovered ${orderedLocales.length} locales: ${orderedLocales.join(", ")}`);

  const parsedData = {};

  for (const loc of orderedLocales) {
    const csvPath = path.join(LOCALES_DIR, `${loc}.csv`);
    const content = fs.readFileSync(csvPath, "utf8");
    const rows = parseCsv(content);
    if (rows.length < 2) {
      throw new Error(`Empty or invalid CSV file: ${csvPath}`);
    }

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const secIdx = header.indexOf("section");
    const keyIdx = header.indexOf("key");
    const enIdx = header.indexOf("en");
    const transIdx = header.indexOf("translation");

    if (secIdx === -1 || keyIdx === -1 || enIdx === -1 || transIdx === -1) {
      throw new Error(
        `Invalid CSV header in ${csvPath}. Expected columns: section,key,en,translation`
      );
    }

    const locData = {
      meta: {},
      bky_std: {},
      bky_custom: {},
      toolbox_categories: {},
      flyout_labels: {},
      ui_strings: {},
      ui_overrides: {},
      dom_patches_flat: []
    };

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 1 && row[0] === "") continue; // skip trailing empty line
      const section = row[secIdx]?.trim();
      const key = row[keyIdx];
      const en = row[enIdx];
      const translation = row[transIdx];

      if (!section || !key) {
        throw new Error(
          `Missing section or key at ${loc}.csv line ${r + 1}: ${JSON.stringify(row)}`
        );
      }

      if (section === "meta") {
        locData.meta[key] = translation;
      } else if (section === "bky_std") {
        locData.bky_std[key] = translation;
      } else if (section === "bky_custom") {
        locData.bky_custom[key] = translation;
      } else if (section === "toolbox_categories") {
        locData.toolbox_categories[key] = translation;
      } else if (section === "flyout_labels") {
        locData.flyout_labels[key] = translation;
      } else if (section === "ui_strings") {
        locData.ui_strings[key] = translation;
      } else if (section === "ui_overrides") {
        locData.ui_overrides[key] = translation;
      } else if (section === "dom_patches") {
        locData.dom_patches_flat.push([key, translation]);
      } else {
        throw new Error(`Unknown section "${section}" in ${loc}.csv line ${r + 1}`);
      }
    }

    locData.dom_patches = unflattenDomPatches(locData.dom_patches_flat);
    locData.ui_catalog = synthesizeUiTree(
      schema.uiCatalogEnTree,
      "",
      locData.ui_overrides,
      locData.ui_strings
    );

    parsedData[loc] = locData;
  }

  // ==========================================================================
  // Strict Validation against 'en'
  // ==========================================================================
  const enData = parsedData.en;
  if (!enData) {
    throw new Error("Missing 'en' locale CSV file (locales/en.csv)!");
  }

  const sectionsToValidate = [
    "bky_std",
    "bky_custom",
    "toolbox_categories",
    "flyout_labels",
    "ui_strings",
    "ui_overrides"
  ];

  for (const loc of orderedLocales) {
    if (loc === "en") continue;
    const locData = parsedData[loc];

    // 1. Meta validation
    for (const metaKey of ["label", "nativeLabel", "short"]) {
      if (!locData.meta[metaKey] || locData.meta[metaKey].length === 0) {
        throw new Error(
          `[Validation Error] Locale "${loc}" is missing or has empty meta.${metaKey}`
        );
      }
    }

    // 2. Exact key parity
    for (const sec of sectionsToValidate) {
      const enKeys = Object.keys(enData[sec]);
      const locKeys = Object.keys(locData[sec]);
      const missing = enKeys.filter((k) => !Object.prototype.hasOwnProperty.call(locData[sec], k));
      const extra = locKeys.filter((k) => !Object.prototype.hasOwnProperty.call(enData[sec], k));

      if (missing.length > 0) {
        throw new Error(
          `[Validation Error] Locale "${loc}" section "${sec}" is missing ${missing.length} keys: ${missing.slice(0, 5).join(", ")}`
        );
      }
      if (extra.length > 0) {
        throw new Error(
          `[Validation Error] Locale "${loc}" section "${sec}" has ${extra.length} unexpected extra keys: ${extra.slice(0, 5).join(", ")}`
        );
      }
    }

    // 3. dom_patches parity
    const enDomKeys = enData.dom_patches_flat.map((x) => x[0]);
    const locDomKeys = locData.dom_patches_flat.map((x) => x[0]);
    const missingDom = enDomKeys.filter((k) => !locDomKeys.includes(k));
    const extraDom = locDomKeys.filter((k) => !enDomKeys.includes(k));
    if (missingDom.length > 0) {
      throw new Error(
        `[Validation Error] Locale "${loc}" is missing dom_patches keys: ${missingDom.join(", ")}`
      );
    }
    if (extraDom.length > 0) {
      throw new Error(
        `[Validation Error] Locale "${loc}" has extra dom_patches keys: ${extraDom.join(", ")}`
      );
    }

    // 4. Placeholder parity
    // Blockly percent tokens (%1..%7)
    for (const sec of ["bky_std", "bky_custom"]) {
      for (const [key, enStr] of Object.entries(enData[sec])) {
        if (key.endsWith("_HELPURL")) continue;
        const locStr = locData[sec][key];
        const enTokens = extractBlocklyPercentTokens(enStr);
        const locTokens = extractBlocklyPercentTokens(locStr);
        if (enTokens.join(",") !== locTokens.join(",")) {
          throw new Error(
            `[Validation Error] Placeholder mismatch in "${loc}" [${sec}.${key}]: expected [${enTokens.join(",")}], got [${locTokens.join(",")}]`
          );
        }
      }
    }

    // UI curly placeholders ({var})
    for (const [key, enStr] of Object.entries(enData.ui_strings)) {
      const locStr = locData.ui_strings[key];
      const enVars = extractCurlyPlaceholders(enStr);
      const locVars = extractCurlyPlaceholders(locStr);
      if (enVars.join(",") !== locVars.join(",")) {
        throw new Error(
          `[Validation Error] Curly placeholder mismatch in "${loc}" [ui_strings: "${key}"]: expected {${enVars.join(",")}}, got {${locVars.join(",")}}`
        );
      }
    }
  }

  console.log(`  ✓ All ${orderedLocales.length} locales passed strict key & placeholder validation.`);

  // ==========================================================================
  // Generate locales/blockly-std.js
  // ==========================================================================
  const bkyStdAll = {};
  for (const loc of orderedLocales) {
    bkyStdAll[loc] = parsedData[loc].bky_std;
  }

  const blocklyStdCode = `/**
 * Auto-generated from locales/*.csv via scripts/build-locales.mjs
 * Standard Google Blockly v10 Message Catalogs (${orderedLocales.join(", ")})
 * Matches all 420 Blockly.Msg keys used by Pybricks Code + cross-tab copy/paste plugin.
 * DO NOT EDIT THIS FILE DIRECTLY - Edit locales/<locale>.csv and run node scripts/build-locales.mjs
 */
(function (root) {
  root.__PYBRICKS_I18N_BKY_STD__ = ${JSON.stringify(bkyStdAll, null, 2)};
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
  fs.writeFileSync(path.join(LOCALES_DIR, "blockly-std.js"), blocklyStdCode, "utf8");
  console.log("  ✓ Generated locales/blockly-std.js");

  // ==========================================================================
  // Generate locales/blockly-pybricks.js
  // ==========================================================================
  const bkyCustomAll = {};
  const toolboxCategoriesAll = {};
  const flyoutLabelsAll = {};

  for (const loc of orderedLocales) {
    bkyCustomAll[loc] = parsedData[loc].bky_custom;
    toolboxCategoriesAll[loc] = parsedData[loc].toolbox_categories;
    flyoutLabelsAll[loc] = parsedData[loc].flyout_labels;
  }

  const blocklyPybricksCode = `/**
 * Auto-generated from locales/*.csv via scripts/build-locales.mjs
 * Pybricks Custom Blockly Messages & Upgraded Setup Block Templates (${orderedLocales.join(", ")})
 * Aligned with official LEGO Education SPIKE Prime / MINDSTORMS / Powered Up terminology.
 * Python code generation (genFunc / NameDB / variable identifiers) is never modified.
 * DO NOT EDIT THIS FILE DIRECTLY - Edit locales/<locale>.csv and run node scripts/build-locales.mjs
 */
(function (root) {
  root.__PYBRICKS_I18N_BKY_CUSTOM__ = ${JSON.stringify(bkyCustomAll, null, 2)};

  // Blockly Setup & variable mutator block templates upgraded to support natural grammatical word order
  root.__PYBRICKS_I18N_MESSAGE0_UPGRADES__ = ${JSON.stringify(schema.message0Upgrades, null, 2)};

  // Non-serializable FieldLabel mutator text map (never touches editable Python code/variables)
  root.__PYBRICKS_I18N_FIELD_LABELS__ = ${JSON.stringify(schema.fieldLabels, null, 2)};

  // Blockly Toolbox Category display labels (internal category names stay untouched for callbacks/icons)
  root.__PYBRICKS_I18N_TOOLBOX_CATEGORIES__ = ${JSON.stringify(toolboxCategoriesAll, null, 2)};

  // Blockly Flyout Section display headers (internal button text stays untouched)
  root.__PYBRICKS_I18N_FLYOUT_LABELS__ = ${JSON.stringify(flyoutLabelsAll, null, 2)};
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
  fs.writeFileSync(path.join(LOCALES_DIR, "blockly-pybricks.js"), blocklyPybricksCode, "utf8");
  console.log("  ✓ Generated locales/blockly-pybricks.js");

  // ==========================================================================
  // Generate locales/ui-catalog.js
  // ==========================================================================
  const targetLocales = orderedLocales.filter((loc) => loc !== "en");

  const supportedLocalesMeta = orderedLocales.map((loc) => ({
    code: loc,
    label: parsedData[loc].meta.label || loc,
    nativeLabel: parsedData[loc].meta.nativeLabel || loc,
    short: parsedData[loc].meta.short || loc.toUpperCase()
  }));

  const uiCatalogAll = {};
  for (const loc of orderedLocales) {
    uiCatalogAll[loc] = parsedData[loc].ui_catalog;
  }

  const uiStringsAll = {};
  for (const k of Object.keys(enData.ui_strings)) {
    uiStringsAll[k] = targetLocales.map((loc) => parsedData[loc].ui_strings[k]);
  }

  const uiOverridesAll = {};
  for (const k of Object.keys(enData.ui_overrides)) {
    uiOverridesAll[k] = targetLocales.map((loc) => parsedData[loc].ui_overrides[k]);
  }

  const domPatchesAll = {};
  for (const loc of orderedLocales) {
    domPatchesAll[loc] = parsedData[loc].dom_patches;
  }

  const uiCatalogCode = `/**
 * Auto-generated from locales/*.csv via scripts/build-locales.mjs
 * Pybricks Code Complete UI Translation Catalogs (${orderedLocales.join(", ")})
 * Covers all 46 @shopify/react-i18n modules (521 leaf paths) + version-resilient string fallback map
 * + targeted non-i18n UI metadata (search placeholder, live sensor telemetry, hub picker, BlueprintJS buttons).
 * DO NOT EDIT THIS FILE DIRECTLY - Edit locales/<locale>.csv and run node scripts/build-locales.mjs
 */
(function (root) {
  root.__PYBRICKS_I18N_SUPPORTED_LOCALES__ = ${JSON.stringify(supportedLocalesMeta, null, 2)};

  root.__PYBRICKS_I18N_UI_STRINGS_LOCALES__ = ${JSON.stringify(targetLocales, null, 2)};

  // Pre-compiled module trees for instant O(1) lookup by @shopify/react-i18n module ID
  root.__PYBRICKS_I18N_UI_CATALOG__ = ${JSON.stringify(uiCatalogAll, null, 2)};

  root.__PYBRICKS_I18N_UI_STRINGS__ = ${JSON.stringify(uiStringsAll, null, 2)};

  root.__PYBRICKS_I18N_UI_OVERRIDES__ = ${JSON.stringify(uiOverridesAll, null, 2)};

  root.__PYBRICKS_I18N_DOM_PATCHES__ = ${JSON.stringify(domPatchesAll, null, 2)};
})(typeof globalThis !== 'undefined' ? globalThis : window);
`;
  fs.writeFileSync(path.join(LOCALES_DIR, "ui-catalog.js"), uiCatalogCode, "utf8");
  console.log("  ✓ Generated locales/ui-catalog.js");

  // ==========================================================================
  // Verify generated JS bundles in fresh VM context
  // ==========================================================================
  console.log("Verifying generated JS bundles in fresh VM sandbox...");
  const sandbox = { window: {}, self: {}, global: {} };
  sandbox.root = sandbox;
  vm.runInNewContext(blocklyStdCode, sandbox);
  vm.runInNewContext(blocklyPybricksCode, sandbox);
  vm.runInNewContext(uiCatalogCode, sandbox);

  for (const loc of orderedLocales) {
    if (!sandbox.__PYBRICKS_I18N_BKY_STD__[loc]) throw new Error(`Missing BKY_STD[${loc}]`);
    if (!sandbox.__PYBRICKS_I18N_BKY_CUSTOM__[loc]) throw new Error(`Missing BKY_CUSTOM[${loc}]`);
    if (!sandbox.__PYBRICKS_I18N_TOOLBOX_CATEGORIES__[loc])
      throw new Error(`Missing TOOLBOX_CATEGORIES[${loc}]`);
    if (!sandbox.__PYBRICKS_I18N_FLYOUT_LABELS__[loc])
      throw new Error(`Missing FLYOUT_LABELS[${loc}]`);
    if (!sandbox.__PYBRICKS_I18N_UI_CATALOG__[loc]) throw new Error(`Missing UI_CATALOG[${loc}]`);
    if (!sandbox.__PYBRICKS_I18N_DOM_PATCHES__[loc]) throw new Error(`Missing DOM_PATCHES[${loc}]`);
  }

  console.log("  ✓ Complete build & round-trip verification succeeded!");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildLocales().catch((err) => {
    console.error("Build failed:", err);
    process.exit(1);
  });
}
