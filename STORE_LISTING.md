# Chrome Web Store 上架与发布全套资料 (`STORE_LISTING.md`)

本文档汇总了将 **Pybricks Code Multi-Language** 提交至 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 或 [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge) 所需的全部字段、多语言商店介绍文案、权限申请理由（Justification）及隐私合规声明。

---

## 1. 安装包文件

- **上传文件**：`release/pybricks-i18n-v1.0.0.zip`（约 181 KB）
- **内置 `_locales` 自动多语言适配**：包内已内置 `_locales/en`、`_locales/zh_CN`、`_locales/zh_TW`、`_locales/es`、`_locales/nl`，商店会自动识别五种语言的扩展名称与简短描述（均已严格通过 Chrome Web Store 字符长度校验：`name ≤ 45`、`short_name ≤ 12`、`description ≤ 132`）。
- **分类建议（Category）**：`Education`（教育）或 `Developer Tools`（开发者工具）

---

## 2. 多语言商店详细说明（Detailed Description）

### 2.1 简体中文 (`zh-CN`)

```text
为 Pybricks Code (code.pybricks.com / beta.pybricks.com) 提供完整界面与 Blockly 编程积木多语言支持（简体中文、繁體中文、西班牙语、荷兰语、英语），专为 LEGO® SPIKE™ Prime / Essential、MINDSTORMS® Robot Inventor / EV3、Technic Hub、City Hub 与 BOOST 创客教学和机器人竞赛（FLL / WRO）打造。

【核心特性】
1. 全量 UI 与 Blockly 积木汉化/多语言化：
   • 完整覆盖 46 个 React 界面模块（521 条词条），包括文件管理、固件刷写向导、蓝牙/USB 连接诊断弹窗与传感器实时遥测标签；
   • 完整覆盖 924 条 Blockly 标准与 Pybricks 专属硬件积木词条、8 大工具箱分类、33 个抽屉分组标题及动态变形器标签。

2. 免刷新实时热切换 & 首屏零闪烁：
   • 支持通过浏览器工具栏弹窗、Pybricks 设置面板原生下拉框或页面右下角快捷切换胶囊，在「简体中文 / 繁體中文 / English / Español / Nederlands」之间一键秒切，无需刷新网页。

3. 绝对不修改 Python 代码（Zero-Code-Mutation 保证）：
   • 采用框架原生四层拦截架构，绝不使用破坏性的全局 DOM 文本替换；
   • 无论切换到何种显示语言，生成的 MicroPython 源码、函数/变量名（如 motor、drive_base）、模块导入名、REPL 终端输出及导出的 .py 文件均 100% 原样保留，与英文原版环境完全兼容互通。

4. 严格对齐乐高官方术语标准：
   • 词库深度参考 LEGO® Education SPIKE™ App、MINDSTORMS® 与 Powered Up 官方本地化术语规范（如集线器/主机、驾驶底座、智能电机/智慧马达、反射光强度、俯仰角/翻滚角/偏航角、堵转限位等）。
```

### 2.2 繁體中文 (`zh-TW`)

```text
為 Pybricks Code (code.pybricks.com / beta.pybricks.com) 提供完整介面與 Blockly 程式積木多語言支援（繁體中文、简体中文、西班牙語、荷蘭語、英語），專為 LEGO® SPIKE™ Prime / Essential、MINDSTORMS® Robot Inventor / EV3、Technic Hub、City Hub 與 BOOST 創客課堂教學及機器人競賽（FLL / WRO）打造。

【核心特色】
1. 完整 UI 與 Blockly 程式積木多語言覆蓋：
   • 涵蓋全部 46 個 React 介面模組（521 條詞條），包含檔案管理、韌體燒錄精靈、藍牙/USB 連線診斷視窗與感測器即時遙測標籤；
   • 涵蓋全部 924 條 Blockly 標準與 Pybricks 專屬硬體積木詞條、8 大工具箱分類、33 個抽屜分組標題及動態變形器標籤。

2. 免重新整理即時熱切換 & 首屏零閃爍：
   • 支援透過瀏覽器工具列彈出視窗、Pybricks 設定面板原生下拉選單或頁面右下角快捷膠囊，在「繁體中文 / 简体中文 / English / Español / Nederlands」之間一鍵秒切，無需重新整理網頁。

3. 絕不修改 Python 程式碼（Zero-Code-Mutation 保證）：
   • 採用框架原生四層攔截架構，絕不使用破壞性的全域 DOM 文字替換；
   • 無論切換至何種顯示語言，產生的 MicroPython 原始碼、函式/變數名稱（如 motor、drive_base）、模組匯入名稱、REPL 終端機輸出及匯出的 .py 檔案均 100% 保持原樣，與英文原版環境完全相容互通。

4. 嚴格對齊樂高官方台灣/香港術語標準：
   • 詞庫深度對齊 LEGO® Education SPIKE™ App、MINDSTORMS® 與 Powered Up 官方繁體中文術語（如主機、駕駛底座、智慧馬達、連接埠、反射光強度、俯仰角/翻滾角/偏航角等）。
```

### 2.3 English (`en`)

```text
Full UI & Blockly multi-language support (Simplified Chinese 简体中文, Traditional Chinese 繁體中文, Spanish Español, Dutch Nederlands, and English) for Pybricks Code (code.pybricks.com & beta.pybricks.com) — built for LEGO® SPIKE™ Prime/Essential, MINDSTORMS® Robot Inventor/EV3, Technic Hub, City Hub, and BOOST classrooms and robotics teams (FLL / WRO).

KEY FEATURES:
1. Complete UI & Blockly Localization:
   • Covers all 46 React UI modules (521 strings) including file management, firmware flasher wizard, Bluetooth/USB troubleshooting dialogs, and live sensor telemetry badges.
   • Covers all 924 standard & Pybricks Blockly keys, 8 toolbox categories, 33 flyout group headers, and dynamic mutator labels.

2. Live Hot-Switching Without Page Reload:
   • Instantly switch between 简体中文, 繁體中文, Español, Nederlands, and English via the toolbar popup, the native Settings panel dropdown, or the optional in-page quick pill — with zero page reload and zero flash of untranslated content (Zero-FOUC).

3. 100% Zero-Code-Mutation Guarantee:
   • Built on a native 4-layer framework interception architecture (React Fiber I18nManager + Blockly locale hooks) rather than fragile DOM text replacement.
   • Generated MicroPython code, variable/function identifiers, module imports, REPL terminal output, and saved .py files remain 100% byte-for-byte untouched across all languages.

4. Aligned with Official LEGO® Education Terminology:
   • Translations carefully follow official LEGO® Education SPIKE™ App, MINDSTORMS®, and Powered Up terminology in each target language.
```

### 2.4 Español (`es`)

```text
Soporte multi-idioma completo de interfaz y bloques Blockly (Español, Chino Simplificado, Chino Tradicional, Neerlandés e Inglés) para Pybricks Code (code.pybricks.com y beta.pybricks.com), diseñado para aulas y equipos de robótica (FLL / WRO) con LEGO® SPIKE™ Prime/Essential, MINDSTORMS® Robot Inventor/EV3, Technic Hub, City Hub y BOOST.

CARACTERÍSTICAS PRINCIPALES:
• Cobertura total: Traduce los 46 módulos de interfaz React (521 textos), el asistente de firmware y los 924 bloques estándar y personalizados de Pybricks, categorías y etiquetas.
• Cambio de idioma en vivo sin recargar la página desde el menú emergente, el panel de Configuración o el selector rápido integrado.
• Garantía 100% Zero-Code-Mutation: El código MicroPython generado, los nombres de variables/funciones, la consola REPL y los archivos .py permanecen 100% intactos byte por byte.
• Terminología oficial alineada con LEGO® Education SPIKE™ App y MINDSTORMS® (Base motriz, Motor inteligente, Sensor de color, cabeceo/alabeo/rumbo).
```

### 2.5 Nederlands (`nl`)

```text
Volledige meertalige ondersteuning voor de gebruikersinterface en Blockly-programmeersblokken (Nederlands, Vereenvoudigd Chinees, Traditioneel Chinees, Spaans en Engels) in Pybricks Code (code.pybricks.com en beta.pybricks.com) voor LEGO® SPIKE™ Prime/Essential, MINDSTORMS® Robot Inventor/EV3, Technic Hub, City Hub en BOOST.

BELANGRIJKSTE KENMERKEN:
• Volledige dekking: Vertaalt alle 46 React UI-modules (521 teksten), de firmware-installatiewizard en alle 924 standaard- en Pybricks-specifieke Blockly-blokken, categorieën en groepskoppen.
• Direct wisselen van taal zonder de pagina te herladen via de extensie-popup, het instellingenpaneel of de snelschakelaar op de pagina.
• 100% Zero-Code-Mutation garantie: Gegenereerde MicroPython-code, variabelenamen, REPL-uitvoer en .py-bestanden blijven 100% byte-voor-byte ongewijzigd.
• Terminologie afgestemd op de officiële LEGO® Education SPIKE™ App en MINDSTORMS® (Rijbasis, Slimme motor, Kleurensensor, uitrollen/remmen/vasthouden).
```

---

## 3. Chrome Web Store 隐私与权限合规填写指南（Privacy Practices）

在 Chrome Developer Dashboard 的 **Privacy practices（隐私权规范）** 标签页中，可直接复制以下内容：

### 3.1 Single Purpose Description（单一用途说明）
```text
This extension provides localized UI and Blockly block translations (Simplified Chinese, Traditional Chinese, Spanish, Dutch, and English) for the Pybricks Code web IDE (code.pybricks.com and beta.pybricks.com) without modifying user Python code.
```

### 3.2 Permission Justifications（权限申请理由）

- **`storage` Permission Justification**：
  ```text
  Used solely to store the user's selected display language preference (e.g., zh-CN, zh-TW, es, nl, en) and whether the in-page quick language switcher pill is visible via chrome.storage.sync / chrome.storage.local.
  ```
- **Host Permissions (`https://code.pybricks.com/*`, `https://beta.pybricks.com/*`) Justification**：
  ```text
  Required to inject the multi-language translation catalogs and React/Blockly localization hooks into the official Pybricks Code web IDE (code.pybricks.com and beta.pybricks.com) at document_start so the interface and Blockly blocks render in the user's chosen language without flash of untranslated text.
  ```
- **Are you using remote code?（是否使用远程代码）**：
  - 选择 **No, I am not using Remote code**（所有翻译词库与脚本 100% 内置在扩展包内，零外部网络请求）。
- **Data Usage Certification（数据收集声明）**：
  - 取消勾选所有数据收集项（本扩展**不收集、不传输、不存储**任何用户个人信息、浏览记录或代码内容），勾选三项合规承诺复选框即可。
