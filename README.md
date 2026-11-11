# Pybricks Code Multi-Language Chrome Extension (`pybricks-i18n`)

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Languages](https://img.shields.io/badge/Languages-简体中文_%7C_繁體中文_%7C_Español_%7C_Nederlands_%7C_English-2ea44f)](locales/)
[![Zero Code Mutation](https://img.shields.io/badge/Python_Code-100%25_Untouched-1d8050)](DESIGN.md)

A native **Manifest V3 Chrome / Edge extension** for **Pybricks Code** (`code.pybricks.com` / `beta.pybricks.com`) providing full UI and Blockly block localization in **Simplified Chinese (`zh-CN`)**, **Traditional Chinese (`zh-TW`)**, **Spanish (`es`)**, **Dutch (`nl`)**, and **English (`en`)** — featuring **live hot-switching without page reload** and a **100% Zero-Code-Mutation guarantee** for generated MicroPython code.

---

## Key Highlights

- **100% Coverage (UI + Blockly Programming Blocks)**
  - Covers all **46 `@shopify/react-i18n` modules (521 UI strings)**, including the firmware flasher wizard, Bluetooth/USB troubleshooting dialogs, and live sensor telemetry badges.
  - Covers all **420 standard Google Blockly v10 keys** + **504 custom Pybricks hardware block keys**, **9 dynamic Setup/Variable/Task block templates**, **8 toolbox categories**, and **33 flyout group headers**.
- **Live Hot-Switching Without Page Reload & Zero-FOUC**
  - Instantly switch languages on the fly via the browser extension toolbar popup, the native dropdown injected into the Pybricks Settings panel, or the optional bottom-right quick switcher pill — with zero page reload and zero flash of untranslated content.
- **100% Zero-Code-Mutation Guarantee**
  - Regardless of the active display language, generated MicroPython source code, variable/function identifiers, module imports, REPL terminal output, and saved `.py` block files remain **100% byte-for-byte identical** and fully interoperable with unmodified English Pybricks environments.
- **Aligned with Official LEGO® Education Terminology**
  - Translations strictly follow official terminology from **LEGO® Education SPIKE™ App**, **MINDSTORMS® Robot Inventor / EV3 Classroom**, and **Powered Up** across all supported languages.

---

## Installation

### Load `dist/` or Release Archive (Developer Mode)

1. Download the latest `pybricks-i18n-v1.0.0.zip` from [GitHub Releases](../../releases) and unzip it (or clone this repository and use the `dist/` directory).
2. Open Chrome or Edge and navigate to `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the unzipped folder (or the `dist/` directory in this repository).
5. Open [https://code.pybricks.com](https://code.pybricks.com) and switch languages in real time!

---

## Development, Building & Packaging

This project uses a **zero-dependency** Node.js toolchain with `locales/<locale>.csv` (RFC-4180 CSV with UTF-8 BOM for direct editing in Excel / Apple Numbers) as the Single Source of Truth (SSOT):

```bash
# 1. Compile runtime locale bundles from locales/*.csv with 100% placeholder validation
npm run build

# 2. Run the end-to-end automated verification suite against real Pybricks production bundles
npm test

# 3. Build, populate dist/ and release/pybricks-i18n-v1.0.0.zip, and run full verification
npm run package
```

For detailed architectural design and the four-layer Python code isolation proof, see [`DESIGN.md`](DESIGN.md). For Chrome Web Store submission materials and privacy justifications, see [`STORE_LISTING.md`](STORE_LISTING.md).
