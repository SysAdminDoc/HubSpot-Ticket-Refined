import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const args = parseArguments(process.argv.slice(2));
if (!args.input || !args.output) {
  throw new Error(
    "Usage: npm run capture -- --input <html-or-mhtml> --output <png> [--theme dark|light|auto] [--width 1600] [--height 1100]",
  );
}

const inputPath = path.resolve(args.input);
const outputPath = path.resolve(args.output);
const theme = allowed(args.theme, ["dark", "light", "auto"], "dark");
const density = allowed(
  args.density,
  ["compact", "comfortable"],
  "compact",
);
const analytics = allowed(
  args.analytics,
  ["compact", "full", "hidden"],
  "compact",
);
const navigation = allowed(
  args.navigation,
  ["slim", "standard"],
  "slim",
);
const width = positiveInteger(args.width, 1600);
const height = positiveInteger(args.height, 1100);
const chromePath = await findChrome(args.chrome);
const profileDir = await mkdtemp(path.join(os.tmpdir(), "htr-chrome-"));
const inputUrl = pathToFileURL(inputPath).href;
const script = await readFile(
  path.join(projectRoot, "src", "HubSpot-Ticket-Refined.user.js"),
  "utf8",
);

await mkdir(path.dirname(outputPath), { recursive: true });

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    "--force-device-scale-factor=1",
    inputUrl,
  ],
  { stdio: "ignore", windowsHide: true },
);

let cdp;
try {
  const port = await readDevToolsPort(profileDir);
  const target = await findPageTarget(port, inputUrl);
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitForReadyState(cdp);
  if (/\.mhtml?$/i.test(inputPath)) {
    await delay(1200);
    await waitForReadyState(cdp);
  }

  const injectedSettings = { theme, density, analytics, navigation };
  const bootstrap = `
globalThis.GM_addStyle = (css) => {
  const style = document.createElement("style");
  style.textContent = css;
  (document.head || document.documentElement).append(style);
  return style;
};
globalThis.GM_getValue = (key, fallback) => key === "hubspot-ticket-refined.settings"
  ? ${JSON.stringify(injectedSettings)}
  : fallback;
globalThis.GM_setValue = () => {};
globalThis.GM_registerMenuCommand = () => {};
${script}
`;
  const evaluation = await cdp.send("Runtime.evaluate", {
    expression: bootstrap,
    awaitPromise: true,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description ||
        evaluation.exceptionDetails.text ||
        "Userscript injection failed",
    );
  }

  await waitForRefined(cdp);
  if (args.panel === "open") {
    await cdp.send("Runtime.evaluate", {
      expression:
        'document.getElementById("htr-control-root")?.shadowRoot?.querySelector(".htr-trigger")?.click()',
      returnByValue: true,
    });
  }
  await delay(450);
  const metricsResult = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const inspect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          background: style.backgroundColor,
          color: style.color,
        };
      };
      const rows = [...document.querySelectorAll('[data-test-id="framework-data-table"] tbody tr')];
      const visibleRows = rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return box.bottom > 0 && box.top < innerHeight;
      });
      const firstRow = rows[0] ? getComputedStyle(rows[0]) : null;
      const bodyStyle = getComputedStyle(document.body);
      return {
        ready: document.documentElement.dataset.htrReady,
        view: document.documentElement.dataset.htrView,
        theme: document.documentElement.dataset.htrTheme,
        density: document.documentElement.dataset.htrDensity,
        tableRows: rows.length,
        visibleRows: visibleRows.length,
        firstRowHeight: rows[0]?.getBoundingClientRect().height || null,
        firstRowBackground: firstRow?.backgroundColor || null,
        bodyBackground: bodyStyle.backgroundColor,
        dataWell: rect('[data-test-id="data-well"]'),
        table: rect('[data-test-id="framework-data-table"]'),
        leftSidebar: rect('[data-test-id="left-sidebar"]'),
        timeline: rect('[data-test-id="crm-events-viz-timeline"]'),
        rightSidebar: rect('[data-test-id="records-right-sidebar"]'),
        controlPresent: Boolean(document.getElementById("htr-control-root")),
        panelOpen: document.getElementById("htr-control-root")?.dataset.open === "true",
        chrome: {
          toolbarRoot: inspect('#hs-global-toolbar-root'),
          toolbar: inspect('[data-test-id="hs-global-toolbar"]'),
          toolbarItems: inspect('.global-toolbar-items-container'),
          verticalNav: inspect('[data-test-id="hs-vertical-nav"]'),
          verticalNavContent: inspect('[data-test-id="hs-vertical-nav-content"]'),
          verticalNavScrollArea: inspect('[data-test-id="scrollable-pane-scroll-area"]'),
          timelineFilter: inspect('[data-selenium-test="timeline-filter-container"] button'),
        },
      };
    })()`,
    returnByValue: true,
  });
  const metrics = metricsResult.result.value;

  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
  const metricsPath = outputPath.replace(/\.png$/i, ".metrics.json");
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath, metricsPath, metrics }, null, 2));
} finally {
  cdp?.close();
  chrome.kill();
  await delay(150);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5 });
}

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) {
      continue;
    }
    parsed[token.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function allowed(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(value || "", 10);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

async function findChrome(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch (_error) {
      // Try the next installed browser.
    }
  }
  throw new Error("Google Chrome or Microsoft Edge was not found");
}

async function readDevToolsPort(profile) {
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
      if (port) {
        return Number(port);
      }
    } catch (_error) {
      // Chrome has not created the file yet.
    }
    await delay(50);
  }
  throw new Error("Chrome did not expose a debugging port");
}

async function findPageTarget(port, expectedUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    const target = targets.find(
      (entry) => entry.type === "page" && entry.url === expectedUrl,
    );
    if (target) {
      return target;
    }
    await delay(50);
  }
  throw new Error("Chrome page target was not found");
}

async function waitForReadyState(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const state = await client.send("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (state.result.value === "complete") {
        return;
      }
    } catch (_error) {
      // MHTML navigation can replace the execution context while loading.
    }
    await delay(50);
  }
  throw new Error("Page did not finish loading");
}

async function waitForRefined(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const state = await client.send("Runtime.evaluate", {
      expression: 'document.documentElement.dataset.htrReady === "true"',
      returnByValue: true,
    });
    if (state.result.value) {
      return;
    }
    await delay(50);
  }
  throw new Error("Userscript did not reach its ready state");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener(
      "open",
      () => {
        let nextId = 1;
        const pending = new Map();
        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          if (!message.id || !pending.has(message.id)) {
            return;
          }
          const callbacks = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) {
            callbacks.reject(new Error(message.error.message));
          } else {
            callbacks.resolve(message.result);
          }
        });
        resolve({
          send(method, params = {}) {
            const id = nextId;
            nextId += 1;
            return new Promise((sendResolve, sendReject) => {
              pending.set(id, { resolve: sendResolve, reject: sendReject });
              socket.send(JSON.stringify({ id, method, params }));
            });
          },
          close() {
            socket.close();
          },
        });
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => reject(new Error("Could not connect to Chrome DevTools")),
      { once: true },
    );
  });
}
