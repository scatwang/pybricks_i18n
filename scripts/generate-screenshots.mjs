#!/usr/bin/env node
/**
 * Automated Store Screenshot Generator for Pybricks Code Multi-Language Extension.
 *
 * Uses local Google Chrome (`--headless=new`) + Chrome DevTools Protocol (CDP) to render
 * live `https://code.pybricks.com/` with our extension catalogs & MAIN-world engine injected
 * at `document_start`, loads a realistic LEGO SPIKE Prime robotics Blockly program alongside
 * the live Monaco MicroPython Code Preview, and captures 5 Chrome Web Store compliant
 * 1280x800 PNG screenshots + 1 440x280 Small Promo Tile into `screenshots/`.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOTS_DIR = path.join(ROOT, "screenshots");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Read extension bundles for `Page.addScriptToEvaluateOnNewDocument`
const UI_CATALOG_JS = fs.readFileSync(path.join(ROOT, "locales", "ui-catalog.js"), "utf8");
const BKY_STD_JS = fs.readFileSync(path.join(ROOT, "locales", "blockly-std.js"), "utf8");
const BKY_PB_JS = fs.readFileSync(path.join(ROOT, "locales", "blockly-pybricks.js"), "utf8");
const PAGE_ENGINE_JS = fs.readFileSync(path.join(ROOT, "src", "page-engine.js"), "utf8");
const STYLES_CSS = fs.readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");
const ICON_B64 = fs.readFileSync(path.join(ROOT, "icons", "icon128.png")).toString("base64");

// Rich, compact robotics mission Blockly AST using exact Pybricks block types
const DEMO_ROBOTICS_WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "blockGlobalSetup",
        id: "setup_root",
        x: 24,
        y: 18,
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
        x: 24,
        y: 308,
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
                  }
                }
              }
            }
          }
        }
      }
    ]
  },
  workspaceOptions: {
    scrollX: 12,
    scrollY: 8,
    scale: 0.74
  }
};

async function startCdpSession(width = 1280, height = 800) {
  const userDataDir = `/tmp/pb-screenshots-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ]);

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome launch timeout")), 10000);
    chrome.stderr.on("data", (d) => {
      const m = String(d).match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
  });

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageWsUrl = targets.find((t) => t.type === "page").webSocketDebuggerUrl;
  const ws = new WebSocket(pageWsUrl);
  await new Promise((r) => ws.addEventListener("open", r));

  let nextId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const curId = nextId++;
      const handler = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === curId) {
          ws.removeEventListener("message", handler);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });

  return {
    chrome,
    send,
    evalJs: async (expression) => {
      const res = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (res.exceptionDetails) {
        throw new Error(`JS Evaluation Error: ${JSON.stringify(res.exceptionDetails)}`);
      }
      return res.result ? res.result.value : undefined;
    },
    capturePng: async (outPath) => {
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true
      });
      fs.writeFileSync(outPath, Buffer.from(data, "base64"));
      console.log(`  ✓ Saved ${path.relative(ROOT, outPath)}`);
    },
    close: async () => {
      ws.close();
      chrome.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 300));
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (_) {}
    }
  };
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log("=== Launching headless Chrome (1280x800) with Pybricks i18n Extension ===");

  const session = await startCdpSession(1280, 800);
  try {
    // Pre-inject our extension catalogs + engine + CSS
    const preloadScript = `
      try {
        localStorage.setItem("pybricks-locale", "en");
      } catch (_) {}
      window.__PB_DEMO_AST__ = ${JSON.stringify(DEMO_ROBOTICS_WORKSPACE)};
      ${UI_CATALOG_JS}
      ${BKY_STD_JS}
      ${BKY_PB_JS}
      ${PAGE_ENGINE_JS}
      window.addEventListener("DOMContentLoaded", () => {
        const st = document.createElement("style");
        st.textContent = ${JSON.stringify(STYLES_CSS)};
        document.head.appendChild(st);
      });
    `;

    await session.send("Page.addScriptToEvaluateOnNewDocument", {
      source: preloadScript
    });

    console.log("  → Navigating to https://code.pybricks.com/ ...");
    await session.send("Page.navigate", { url: "https://code.pybricks.com/" });
    await new Promise((r) => setTimeout(r, 4500));

    // Create `robot_mission.py` Blockly file, activate Free Trial, and open side-by-side Code Preview
    await session.evalJs(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      // Dismiss Joyride tour cleanly via React click + scroll back to top
      const closeTour = document.querySelector(".react-joyride__tooltip button[title=Close]");
      if (closeTour) closeTour.click();
      await sleep(250);
      window.scrollTo(0, 0);

      // Hook Blockly.serialization.workspaces.load via engine.getBlockly() as soon as 8475.js loads
      const installDemoWorkspaceHook = () => {
        const eng = window.__PYBRICKS_I18N_ENGINE__;
        const bky = eng && eng.getBlockly ? eng.getBlockly() : null;
        if (bky && bky.serialization && bky.serialization.workspaces && !bky.__demoSeeded) {
          bky.__demoSeeded = true;
          const origLoad = bky.serialization.workspaces.load;
          bky.serialization.workspaces.load = function(state, workspace, ...rest) {
            window.__ACTIVE_BKY_WORKSPACE__ = workspace;
            const res = origLoad.call(
              this,
              JSON.parse(JSON.stringify(window.__PB_DEMO_AST__)),
              workspace,
              ...rest
            );
            setTimeout(() => {
              try {
                workspace.setScale(0.74);
                workspace.scroll(12, 8);
              } catch (_) {}
            }, 60);
            return res;
          };
        }
      };
      const hookTimer = setInterval(installDemoWorkspaceHook, 30);

      // 1. Open File Explorer
      const toolbarBtns = document.querySelectorAll(".pb-toolbar button");
      if (toolbarBtns[0]) toolbarBtns[0].click();
      await sleep(400);

      // 2. Click "Create a new file" (+ button)
      const activityBtns = document.querySelectorAll(".pb-app-activities button");
      if (activityBtns[2]) activityBtns[2].click();
      await sleep(500);

      // 3. Enter "robot_mission" and click Create
      const input = document.querySelector(".bp5-dialog input.bp5-input");
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeSetter.call(input, "robot_mission");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(250);
        const submitBtn = document.querySelector(".bp5-dialog button[type=submit]");
        if (submitBtn) submitBtn.click();
      }

      // Wait for Blockly chunk (4852.js) to load
      for (let i = 0; i < 40; i++) {
        installDemoWorkspaceHook();
        if (document.querySelector(".blocklySvg")) break;
        await sleep(200);
      }
      clearInterval(hookTimer);
      installDemoWorkspaceHook();
      await sleep(800);

      // Click official "Try free" button if the Blockly trial dialog is shown
      const tryFreeBtn = Array.from(document.querySelectorAll(".bp5-dialog button")).find(
        (b) => (b.innerText || "").includes("Try free")
      );
      if (tryFreeBtn) {
        tryFreeBtn.click();
        await sleep(700);
      }

      // Close any remaining confirmation dialog cleanly via close button
      document.querySelectorAll(".bp5-dialog-close-button").forEach((b) => b.click());
      await sleep(400);

      // Open the right-hand Python Code Preview split pane
      const previewBtn = document.querySelector(".pb-editor-buttons button");
      if (previewBtn) {
        previewBtn.click();
        await sleep(700);
      }

      // Hide bottom terminal so Blockly + Python Code Preview have full vertical height
      const sideViewBtns = document.querySelectorAll(".pb-app-side-view-buttons button");
      if (sideViewBtns[1]) {
        sideViewBtns[1].click();
        await sleep(400);
      }
      window.scrollTo(0, 0);
    })()`);

    // Helper to inject a sleek store feature badge + simulated Extension Popup card
    const setOverlayCard = async ({ badgeTitle, badgeSub, showPopup = false, activeLocale = "zh-CN" }) => {
      await session.evalJs(`(() => {
        document.querySelectorAll("#pb-store-shot-overlay").forEach((el) => el.remove());
        // Close any dialog if one appeared, NEVER removing document.body!
        document.querySelectorAll(".bp5-dialog-close-button").forEach((b) => b.click());

        const wrap = document.createElement("div");
        wrap.id = "pb-store-shot-overlay";
        wrap.innerHTML = \`
          <style>
            .bp5-portal .bp5-overlay-backdrop,
            .bp5-portal .bp5-dialog-container {
              display: none !important;
            }
            #pb-store-banner {
              position: fixed;
              bottom: 16px;
              left: 245px;
              z-index: 99998;
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 10px 16px;
              border-radius: 12px;
              background: rgba(15, 23, 42, 0.94);
              backdrop-filter: blur(10px);
              color: #ffffff;
              box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.16);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            }
            #pb-store-banner img {
              width: 34px;
              height: 34px;
              border-radius: 8px;
            }
            #pb-store-banner .b-title {
              font-size: 13.5px;
              font-weight: 700;
              letter-spacing: 0.1px;
              color: #ffffff;
            }
            #pb-store-banner .b-sub {
              font-size: 11.5px;
              color: #6ee7b7;
              font-weight: 600;
              margin-top: 2px;
            }
            #pb-store-popup-mock {
              position: fixed;
              top: 46px;
              right: 18px;
              width: 280px;
              z-index: 99999;
              padding: 12px;
              border-radius: 12px;
              background: #ffffff;
              color: #1c2127;
              box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.1);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            }
            .pm-head {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 9px;
            }
            .pm-brand {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .pm-brand img {
              width: 25px;
              height: 25px;
              border-radius: 6px;
            }
            .pm-title { font-size: 12.5px; font-weight: 700; color: #1c2127; }
            .pm-sub { font-size: 10px; color: #5f6b7c; }
            .pm-badge {
              font-size: 10px;
              font-weight: 700;
              padding: 2px 7px;
              border-radius: 99px;
              background: rgba(29, 128, 80, 0.12);
              color: #1d8050;
            }
            .pm-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px;
              margin-bottom: 8px;
            }
            .pm-card {
              padding: 6px 8px;
              border-radius: 7px;
              border: 1.5px solid #dde2e8;
              background: #ffffff;
            }
            .pm-card.active {
              border-color: #2d72d2;
              background: rgba(45, 114, 210, 0.09);
            }
            .pm-top {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 12px;
              font-weight: 650;
              color: #1c2127;
            }
            .pm-tag {
              font-size: 9.5px;
              font-weight: 700;
              padding: 1px 5px;
              border-radius: 4px;
              background: #dde2e8;
              color: #5f6b7c;
            }
            .pm-card.active .pm-tag {
              background: #2d72d2;
              color: #fff;
            }
            .pm-en {
              font-size: 9.5px;
              color: #5f6b7c;
              margin-top: 2px;
            }
            .pm-note {
              font-size: 10px;
              color: #1d8050;
              background: rgba(29, 128, 80, 0.08);
              border: 1px dashed rgba(29, 128, 80, 0.35);
              border-radius: 6px;
              padding: 6px 8px;
              line-height: 1.35;
              font-weight: 600;
            }
          </style>
          <div id="pb-store-banner">
            <img src="data:image/png;base64,${ICON_B64}" alt="icon" />
            <div>
              <div class="b-title">\${${JSON.stringify(badgeTitle)}}</div>
              <div class="b-sub">\${${JSON.stringify(badgeSub)}}</div>
            </div>
          </div>
          \${${showPopup} ? \`
            <div id="pb-store-popup-mock">
              <div class="pm-head">
                <div class="pm-brand">
                  <img src="data:image/png;base64,${ICON_B64}" alt="icon" />
                  <div>
                    <div class="pm-title">Pybricks Multi-Language</div>
                    <div class="pm-sub">UI & Blockly Live Switcher</div>
                  </div>
                </div>
                <span class="pm-badge">● Active</span>
              </div>
              <div class="pm-grid">
                <div class="pm-card \${${JSON.stringify(activeLocale)} === 'zh-CN' ? 'active' : ''}">
                  <div class="pm-top"><span>简体中文</span><span class="pm-tag">中文</span></div>
                  <div class="pm-en">Simplified Chinese</div>
                </div>
                <div class="pm-card \${${JSON.stringify(activeLocale)} === 'zh-TW' ? 'active' : ''}">
                  <div class="pm-top"><span>繁體中文</span><span class="pm-tag">繁中</span></div>
                  <div class="pm-en">Traditional Chinese</div>
                </div>
                <div class="pm-card \${${JSON.stringify(activeLocale)} === 'en' ? 'active' : ''}">
                  <div class="pm-top"><span>English</span><span class="pm-tag">EN</span></div>
                  <div class="pm-en">Original UI</div>
                </div>
                <div class="pm-card \${${JSON.stringify(activeLocale)} === 'es' ? 'active' : ''}">
                  <div class="pm-top"><span>Español</span><span class="pm-tag">ES</span></div>
                  <div class="pm-en">Spanish</div>
                </div>
                <div class="pm-card \${${JSON.stringify(activeLocale)} === 'nl' ? 'active' : ''}">
                  <div class="pm-top"><span>Nederlands</span><span class="pm-tag">NL</span></div>
                  <div class="pm-en">Dutch</div>
                </div>
              </div>
              <div class="pm-note">✓ Zero-Code-Mutation: Generated MicroPython code & .py files remain 100% untouched.</div>
            </div>
          \` : ""}
        \`;
        document.body.appendChild(wrap);
      })()`);
    };

    // ========================================================================
    // Screenshot 1: Simplified Chinese (zh-CN) — Blocks + Python Preview + Popup
    // ========================================================================
    console.log("\n=== Capturing Screenshot 1: Simplified Chinese (zh-CN) ===");
    await session.evalJs(`(async () => {
      window.__PYBRICKS_I18N_ENGINE__.setLocale("zh-CN");
      await new Promise(r => setTimeout(r, 900));
    })()`);
    await setOverlayCard({
      badgeTitle: "简体中文 (zh-CN) — 全量界面与 Blockly 编程积木汉化",
      badgeSub: "✓ 对齐 LEGO® SPIKE™ 官方术语  |  ✓ 右侧生成的 MicroPython 代码 100% 原样保留",
      showPopup: true,
      activeLocale: "zh-CN"
    });
    await new Promise((r) => setTimeout(r, 200));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "01-zh-CN-blocks-and-python.png"));

    // ========================================================================
    // Screenshot 2: Traditional Chinese (zh-TW) — Toolbox Flyout Drawer + Blocks
    // ========================================================================
    console.log("\n=== Capturing Screenshot 2: Traditional Chinese (zh-TW) ===");
    await session.evalJs(`(async () => {
      window.__PYBRICKS_I18N_ENGINE__.setLocale("zh-TW");
      await new Promise(r => setTimeout(r, 900));
      // Click the "設定" (Setup) or "輸出" (Output) category in Blockly toolbox to open the localized flyout drawer!
      const treeRows = document.querySelectorAll(".blocklyTreeRow");
      if (treeRows[0]) {
        treeRows[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
        treeRows[0].click();
      }
      await new Promise(r => setTimeout(r, 400));
    })()`);
    await setOverlayCard({
      badgeTitle: "繁體中文 (zh-TW) — 工具箱分類、抽屜積木與台灣/香港官方術語",
      badgeSub: "✓ 主機 / 智慧馬達 / 駕駛底座 / 連接埠  |  ✓ 免重新整理即時熱切換",
      showPopup: false,
      activeLocale: "zh-TW"
    });
    await new Promise((r) => setTimeout(r, 200));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "02-zh-TW-flyout-and-toolbox.png"));

    // ========================================================================
    // Screenshot 3: Spanish (es) — Full Spanish Workspace + Untouched Python
    // ========================================================================
    console.log("\n=== Capturing Screenshot 3: Spanish (Español) ===");
    await session.evalJs(`(async () => {
      window.__PYBRICKS_I18N_ENGINE__.setLocale("es");
      await new Promise(r => setTimeout(r, 900));
    })()`);
    await setOverlayCard({
      badgeTitle: "Español (es) — Interfaz completa y bloques Blockly en Español",
      badgeSub: "✓ Base motriz / Motor inteligente / Sensor de color  |  ✓ Código Python 100% intacto",
      showPopup: true,
      activeLocale: "es"
    });
    await new Promise((r) => setTimeout(r, 200));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "03-es-spanish-workspace.png"));

    // ========================================================================
    // Screenshot 4: Dutch (nl) — Settings Panel + Native Language Selector + Blocks
    // ========================================================================
    console.log("\n=== Capturing Screenshot 4: Dutch (Nederlands) + Settings Panel ===");
    await session.evalJs(`(async () => {
      window.__PYBRICKS_I18N_ENGINE__.setLocale("nl");
      await new Promise(r => setTimeout(r, 900));
      // Click the Settings toolbar button (2nd button in .pb-toolbar) to show localized Settings & Language dropdown
      const toolbarBtns = document.querySelectorAll(".pb-toolbar button");
      if (toolbarBtns[1]) toolbarBtns[1].click();
      await new Promise(r => setTimeout(r, 500));
    })()`);
    await setOverlayCard({
      badgeTitle: "Nederlands (nl) — Volledige UI, Instellingen & Blockly-vertaling",
      badgeSub: "✓ Rijbasis / Slimme motor / Kleurensensor  |  ✓ Direct wisselen zonder herladen",
      showPopup: false,
      activeLocale: "nl"
    });
    await new Promise((r) => setTimeout(r, 200));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "04-nl-dutch-settings-and-blocks.png"));

    // ========================================================================
    // Screenshot 5: 5-Language Live Comparison & Zero-Code-Mutation Architecture Showcase
    // ========================================================================
    console.log("\n=== Capturing Screenshot 5: 5-Language Comparison Showcase (1280x800) ===");
    await session.evalJs(`(() => {
      const showcase = document.createElement("div");
      showcase.id = "pb-full-showcase";
      showcase.innerHTML = \`
        <style>
          #pybricks-i18n-quick-pill { display: none !important; }
          #pb-full-showcase {
            position: fixed;
            inset: 0;
            width: 1280px;
            height: 800px;
            z-index: 999999;
            overflow: hidden;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f2027 100%) !important;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            padding: 34px 42px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          #pb-full-showcase * { box-sizing: border-box; }
          .top-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .brand-row {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          .brand-row img {
            width: 58px;
            height: 58px;
            border-radius: 14px;
            box-shadow: 0 8px 24px rgba(56, 189, 248, 0.35);
          }
          .brand-title {
            font-size: 27px;
            font-weight: 800;
            letter-spacing: -0.3px;
            color: #ffffff;
          }
          .brand-sub {
            font-size: 14.5px;
            color: #93c5fd;
            margin-top: 4px;
            font-weight: 500;
          }
          .pill-badges {
            display: flex;
            gap: 10px;
          }
          .pill-badge {
            padding: 8px 14px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            background: rgba(16, 185, 129, 0.18);
            border: 1px solid rgba(16, 185, 129, 0.5);
            color: #6ee7b7;
          }
          .main-grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 24px;
            height: 545px;
          }
          .panel {
            background: rgba(30, 41, 59, 0.86);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 16px;
            padding: 20px 22px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35);
          }
          .panel-title {
            font-size: 13.5px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #38bdf8;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .lang-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .lang-row {
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 11px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .lang-tag {
            width: 88px;
            flex-shrink: 0;
            padding: 5px 8px;
            border-radius: 7px;
            font-size: 12px;
            font-weight: 800;
            text-align: center;
            background: #2563eb;
            color: #ffffff;
          }
          .lang-blocks {
            display: flex;
            flex-direction: column;
            gap: 5px;
            font-size: 12.5px;
            font-weight: 600;
          }
          .b-chip {
            display: inline-block;
            padding: 3px 9px;
            border-radius: 6px;
            background: #0284c7;
            color: #fff;
            margin-right: 6px;
          }
          .b-chip.ctrl { background: #d97706; }
          .b-chip.sens { background: #7c3aed; }
          .code-box {
            flex: 1;
            background: #0b1120;
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 12px;
            padding: 15px 17px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
            font-size: 12.2px;
            line-height: 1.52;
            color: #e2e8f0;
            white-space: pre;
            overflow: hidden;
          }
          .kw { color: #c084fc; font-weight: 600; }
          .fn { color: #60a5fa; }
          .num { color: #fbbf24; }
          .cm { color: #64748b; }
          .code-footer {
            margin-top: 12px;
            padding: 10px 14px;
            border-radius: 10px;
            background: rgba(16, 185, 129, 0.16);
            border: 1px solid rgba(16, 185, 129, 0.45);
            color: #6ee7b7;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.4;
          }
          .bottom-bar {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }
          .stat-card {
            background: rgba(30, 41, 59, 0.86);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 12px;
            padding: 12px 16px;
          }
          .stat-num {
            font-size: 20px;
            font-weight: 800;
            color: #38bdf8;
          }
          .stat-label {
            font-size: 12px;
            color: #cbd5e1;
            margin-top: 3px;
          }
        </style>
        <div class="top-header">
          <div class="brand-row">
            <img src="data:image/png;base64,${ICON_B64}" alt="logo" />
            <div>
              <div class="brand-title">Pybricks Code Multi-Language Extension</div>
              <div class="brand-sub">Live Hot-Switching across 5 Languages • Aligned with LEGO® Education SPIKE™ & MINDSTORMS®</div>
            </div>
          </div>
          <div class="pill-badges">
            <span class="pill-badge">✓ 100% Zero-Code-Mutation</span>
            <span class="pill-badge">✓ Manifest V3 • Zero-FOUC</span>
          </div>
        </div>

        <div class="main-grid">
          <div class="panel">
            <div class="panel-title">
              <span>Blockly Surface Localization Across All 5 Languages</span>
              <span style="color:#94a3b8;font-size:12px;">Instant Hot-Switch</span>
            </div>
            <div class="lang-stack">
              <div class="lang-row">
                <div class="lang-tag">简体中文</div>
                <div class="lang-blocks">
                  <div><span class="b-chip">drive_base 行驶 直线 距离 250 mm 结束后 滑行</span></div>
                  <div><span class="b-chip ctrl">多任务并行直到 全部任务 完成</span><span class="b-chip sens">color_sensor 连接端口 C</span></div>
                </div>
              </div>
              <div class="lang-row">
                <div class="lang-tag">繁體中文</div>
                <div class="lang-blocks">
                  <div><span class="b-chip">drive_base 行駛 直線 距離 250 mm 結束後 滑行</span></div>
                  <div><span class="b-chip ctrl">多工並行直到 全部任務 完成</span><span class="b-chip sens">color_sensor 連接埠 C</span></div>
                </div>
              </div>
              <div class="lang-row">
                <div class="lang-tag">Español</div>
                <div class="lang-blocks">
                  <div><span class="b-chip">drive_base mover recto durante 250 mm luego inercia</span></div>
                  <div><span class="b-chip ctrl">multitarea hasta completar todas</span><span class="b-chip sens">color_sensor en puerto C</span></div>
                </div>
              </div>
              <div class="lang-row">
                <div class="lang-tag">Nederlands</div>
                <div class="lang-blocks">
                  <div><span class="b-chip">drive_base rijd rechtuit voor 250 mm dan uitrollen</span></div>
                  <div><span class="b-chip ctrl">multitask tot alles klaar</span><span class="b-chip sens">color_sensor op C</span></div>
                </div>
              </div>
              <div class="lang-row">
                <div class="lang-tag">English</div>
                <div class="lang-blocks">
                  <div><span class="b-chip">drive_base drive straight for 250 mm then coast</span></div>
                  <div><span class="b-chip ctrl">multitask until all done</span><span class="b-chip sens">color_sensor on C</span></div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-title">
              <span>Generated MicroPython Output</span>
              <span style="color:#6ee7b7;font-size:12px;">100% Byte-for-Byte Identical</span>
            </div>
            <div class="code-box"><span class="kw">from</span> pybricks.hubs <span class="kw">import</span> PrimeHub
<span class="kw">from</span> pybricks.parameters <span class="kw">import</span> Axis, Direction, Port, Stop
<span class="kw">from</span> pybricks.pupdevices <span class="kw">import</span> ColorSensor, Motor
<span class="kw">from</span> pybricks.robotics <span class="kw">import</span> DriveBase
<span class="kw">from</span> pybricks.tools <span class="kw">import</span> multitask, run_task

<span class="cm"># Set up all devices (Identifiers 100% untouched)</span>
prime_hub = <span class="fn">PrimeHub</span>(top_side=Axis.Z, front_side=Axis.X)
left_motor = <span class="fn">Motor</span>(Port.A, Direction.COUNTERCLOCKWISE)
right_motor = <span class="fn">Motor</span>(Port.B, Direction.CLOCKWISE)
drive_base = <span class="fn">DriveBase</span>(left_motor, right_motor, <span class="num">56</span>, <span class="num">112</span>)
color_sensor = <span class="fn">ColorSensor</span>(Port.C)

<span class="kw">async def</span> <span class="fn">main</span>():
    <span class="kw">await</span> <span class="fn">multitask</span>(
        drive_base.<span class="fn">straight</span>(<span class="num">250</span>, then=Stop.COAST),
        left_motor.<span class="fn">run_angle</span>(<span class="num">500</span>, <span class="num">180</span>, then=Stop.BRAKE),
    )</div>
            <div class="code-footer">
              ✓ 4-Layer Native Interception Firewall guarantees exported .py files, variable names & REPL output never mutate.
            </div>
          </div>
        </div>

        <div class="bottom-bar">
          <div class="stat-card">
            <div class="stat-num">46 UI Modules</div>
            <div class="stat-label">521 React i18n strings + Firmware Wizard</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">924 Blockly Keys</div>
            <div class="stat-label">420 Standard + 504 Pybricks Hardware Keys</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">5 Languages</div>
            <div class="stat-label">简体中文 • 繁體中文 • Español • Nederlands • EN</div>
          </div>
          <div class="stat-card">
            <div class="stat-num">0 Bytes Diff</div>
            <div class="stat-label">100% Identical Python & JSON AST Output</div>
          </div>
        </div>
      \`;
      document.body.appendChild(showcase);
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "05-five-language-code-identity.png"));

    // ========================================================================
    // Bonus: Chrome Web Store Small Promo Tile (440x280)
    // ========================================================================
    console.log("\n=== Capturing Bonus Chrome Web Store Small Promo Tile (440x280) ===");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 440,
      height: 280,
      deviceScaleFactor: 1,
      mobile: false
    });
    await session.evalJs(`(() => {
      const tile = document.getElementById("pb-full-showcase");
      tile.innerHTML = \`
        <style>
          #pybricks-i18n-quick-pill { display: none !important; }
          #pb-full-showcase {
            position: fixed;
            inset: 0;
            width: 440px;
            height: 280px;
            z-index: 999999;
            overflow: hidden;
            background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%) !important;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
            padding: 24px 26px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          #pb-full-showcase * { box-sizing: border-box; }
          .head {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .head img {
            width: 54px;
            height: 54px;
            border-radius: 12px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.35);
          }
          .title {
            font-size: 21px;
            font-weight: 800;
            line-height: 1.2;
            color: #ffffff;
          }
          .sub {
            font-size: 12.5px;
            color: #93c5fd;
            margin-top: 3px;
            font-weight: 600;
          }
          .langs {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
          }
          .l-pill {
            padding: 6px 11px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.14);
            border: 1px solid rgba(255, 255, 255, 0.28);
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
          }
          .foot {
            padding: 9px 12px;
            border-radius: 9px;
            background: rgba(16, 185, 129, 0.22);
            border: 1px solid rgba(16, 185, 129, 0.55);
            color: #a7f3d0;
            font-size: 12px;
            font-weight: 700;
            text-align: center;
          }
        </style>
        <div class="head">
          <img src="data:image/png;base64,${ICON_B64}" alt="logo" />
          <div>
            <div class="title">Pybricks Code<br/>Multi-Language</div>
            <div class="sub">Full UI & Blockly Live Switcher</div>
          </div>
        </div>
        <div class="langs">
          <span class="l-pill">简体中文</span>
          <span class="l-pill">繁體中文</span>
          <span class="l-pill">Español</span>
          <span class="l-pill">Nederlands</span>
          <span class="l-pill">English</span>
        </div>
        <div class="foot">✓ 100% Untouched MicroPython Code</div>
      \`;
    })()`);
    await new Promise((r) => setTimeout(r, 150));
    await session.capturePng(path.join(SCREENSHOTS_DIR, "promo-tile-440x280.png"));

    console.log("\n=== All screenshots generated successfully in screenshots/ ===");
  } finally {
    await session.close();
  }
}

main();
