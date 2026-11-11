#!/usr/bin/env node
/**
 * Release packager for Pybricks Code Multi-Language Chrome Extension (Manifest V3).
 *
 * Actions performed:
 *   1. Runs `scripts/build-locales.mjs` (CSV -> JS catalog compiler + placeholder check)
 *   2. Validates `manifest.json` and `_locales/<locale>/messages.json` against Chrome Web Store limits
 *      (extName <= 45 chars, extShortName <= 12 chars, extDescription <= 132 chars)
 *   3. Assembles clean unpacked extension directory at `dist/` (only runtime assets)
 *   4. Creates Chrome Web Store / GitHub Release `.zip` archive at `release/pybricks-i18n-v<version>.zip`
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const RELEASE_DIR = path.join(ROOT, "release");

const RUNTIME_FILES = [
  "manifest.json",
  "_locales/en/messages.json",
  "_locales/zh_CN/messages.json",
  "_locales/zh_TW/messages.json",
  "_locales/es/messages.json",
  "_locales/nl/messages.json",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "locales/ui-catalog.js",
  "locales/blockly-std.js",
  "locales/blockly-pybricks.js",
  "src/page-engine.js",
  "src/content-bridge.js",
  "src/styles.css",
  "src/popup.html",
  "src/popup.js"
];

function main() {
  console.log("=== Step 1: Compiling & validating locale bundles ===");
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-locales.mjs")], {
    stdio: "inherit"
  });

  console.log("\n=== Step 2: Validating Manifest V3 & Chrome Web Store `_locales` limits ===");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3, "manifest_version must be 3");
  assert.equal(manifest.default_locale, "en", "default_locale must be 'en'");
  const version = manifest.version;
  assert(/^\d+\.\d+\.\d+$/.test(version), `Invalid version format: ${version}`);

  const storeLocales = ["en", "zh_CN", "zh_TW", "es", "nl"];
  for (const loc of storeLocales) {
    const msgPath = path.join(ROOT, "_locales", loc, "messages.json");
    assert(fs.existsSync(msgPath), `Missing ${msgPath}`);
    const msgs = JSON.parse(fs.readFileSync(msgPath, "utf8"));
    const nameLen = [...msgs.extName.message].length;
    const shortLen = [...msgs.extShortName.message].length;
    const descLen = [...msgs.extDescription.message].length;

    assert(nameLen <= 45, `[${loc}] extName length ${nameLen} > 45: ${msgs.extName.message}`);
    assert(shortLen <= 12, `[${loc}] extShortName length ${shortLen} > 12: ${msgs.extShortName.message}`);
    assert(descLen <= 132, `[${loc}] extDescription length ${descLen} > 132: ${msgs.extDescription.message}`);
    console.log(
      `  ✓ _locales/${loc.padEnd(5)}: name=${nameLen}/45, short_name=${shortLen}/12, description=${descLen}/132`
    );
  }

  console.log("\n=== Step 3: Assembling clean unpacked extension in dist/ ===");
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  let totalBytes = 0;
  for (const relPath of RUNTIME_FILES) {
    const srcPath = path.join(ROOT, relPath);
    assert(fs.existsSync(srcPath), `Missing runtime file: ${relPath}`);
    const destPath = path.join(DIST_DIR, relPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    const stat = fs.statSync(destPath);
    totalBytes += stat.size;
  }
  console.log(
    `  ✓ Copied ${RUNTIME_FILES.length} runtime files to dist/ (${(totalBytes / 1024).toFixed(1)} KB uncompressed)`
  );

  console.log("\n=== Step 4: Creating Chrome Web Store ZIP package ===");
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
  const zipName = `pybricks-i18n-v${version}.zip`;
  const zipPath = path.join(RELEASE_DIR, zipName);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  execFileSync("zip", ["-r", "-q", "-9", zipPath, "."], {
    cwd: DIST_DIR,
    stdio: "inherit"
  });

  const zipStat = fs.statSync(zipPath);
  console.log(
    `  ✓ Created ${path.relative(ROOT, zipPath)} (${(zipStat.size / 1024).toFixed(1)} KB compressed)`
  );
}

main();
