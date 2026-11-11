# Pybricks Code Multi-Language Chrome Extension (`pybricks-i18n`)

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![Languages](https://img.shields.io/badge/Languages-简体中文_%7C_繁體中文_%7C_Español_%7C_Nederlands_%7C_English-2ea44f)](locales/)
[![Zero Code Mutation](https://img.shields.io/badge/Python_Code-100%25_Untouched-1d8050)](DESIGN.md)

为 **Pybricks Code**（`code.pybricks.com` / `beta.pybricks.com`）打造的原级 **Manifest V3 Chrome / Edge 浏览器多语言扩展**，提供 **简体中文（`zh-CN`）**、**繁體中文（`zh-TW`）**、**西班牙语（`es`）**、**荷兰语（`nl`）** 与 **英语（`en`）** 全量 UI 与 Blockly 积木多语言支持，支持**免刷新实时热切换**且**绝不修改任何生成的 MicroPython 代码**。

---

## 核心特性 (Key Highlights)

- **全量覆盖（UI + Blockly 编程积木）**
  - 覆盖全部 **46 个 `@shopify/react-i18n` 模块（521 条界面词条）**、固件刷写向导、蓝牙/USB 诊断说明及传感器遥测徽章；
  - 覆盖全部 **420 条 Google Blockly v10 标准词条** + **504 条 Pybricks 专属硬件积木词条**、**9 个动态 Setup/变量/任务积木模板**、**8 大工具箱分类**及 **33 个抽屉分组标题**。
- **免刷新实时热切换 & 首屏零闪烁（Zero-FOUC）**
  - 通过浏览器的扩展弹窗（Popup）、设置面板原生下拉框或页面右下角快捷胶囊一键秒切语言，无需刷新网页。
- **绝对不触碰 Python 代码（Zero-Code-Mutation）**
  - 无论切换何种界面语言，生成的 MicroPython 源码、变量/函数标识符、模块导入名、终端 REPL 输出及 `.py` 积木文件均保持 **100% 字节级一致**，可与未安装扩展的原版英文环境无损互通。
- **对齐 LEGO® 官方术语体系**
  - 严格对齐 **LEGO® Education SPIKE™ App**、**MINDSTORMS® Robot Inventor / EV3 Classroom** 与 **Powered Up** 官方多语言术语规范（如大陆“集线器 / 智能电机 / 端口 / 反射光强度”与台湾“主機 / 智慧馬達 / 連接埠 / 反射光強度”）。

---

## 快速安装 (Installation)

### 方式一：下载 Release 压缩包或加载 `dist/` 目录（开发者模式）

1. 在 [GitHub Releases](../../releases) 下载最新的 `pybricks-i18n-v1.0.0.zip` 并解压（或在本地克隆仓库后使用 `dist/` 目录）；
2. 在 Chrome / Edge 地址栏输入 `chrome://extensions/`（或 `edge://extensions/`）；
3. 开启右上角的 **「开发者模式」(Developer mode)**；
4. 点击左上角 **「加载已解压的扩展程序」(Load unpacked)**，选择解压后的文件夹（或项目下的 `dist/` 目录）；
5. 打开 [https://code.pybricks.com](https://code.pybricks.com) 即可实时切换语言！

---

## 开发、词库构建与打包验证 (Development & Packaging)

本项目采用 **零外部依赖** Node.js 工具链，以 `locales/<locale>.csv`（含 UTF-8 BOM，支持 Excel / Numbers 直接编辑）作为单一数据源（SSOT）：

```bash
# 1. 从 locales/*.csv 编译生成运行时词库 JS 并执行 100% 占位符校验
npm run build

# 2. 运行基于真实 Pybricks 生产构建分包的端到端自动化验证套件
npm test

# 3. 一键构建、生成 dist/ 解压目录与 release/pybricks-i18n-v1.0.0.zip 并执行全量回归测试
npm run package
```

详细架构设计与四重代码隔离证明请参阅 [`DESIGN.md`](DESIGN.md)，Chrome 商店上架资料请参阅 [`STORE_LISTING.md`](STORE_LISTING.md)。
