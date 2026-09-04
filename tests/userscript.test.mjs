import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { JSDOM } from "jsdom";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const source = await readFile(
  path.join(projectRoot, "src", "HubSpot-Ticket-Refined.user.js"),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);

test("metadata and runtime versions stay in sync", () => {
  const metadataVersion = source.match(/^\/\/ @version\s+([^\s]+)$/m)?.[1];
  const runtimeVersion = source.match(/const VERSION = "([^"]+)";/)?.[1];

  assert.equal(metadataVersion, packageJson.version);
  assert.equal(runtimeVersion, packageJson.version);
  assert.match(source, /@run-at\s+document-start/);
  assert.match(source, /@inject-into\s+content/);
  assert.match(source, /@match\s+https:\/\/app\.hubspot\.com\/contacts\/\*\/objects\/0-5\/\*/);
  assert.match(source, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\//);
});

test("ticket list activates compact styling and semantic row status", async () => {
  const { dom, store } = await loadFixture(
    "tickets-list.html",
    "https://app.hubspot.com/contacts/123/objects/0-5/views/456/list",
  );
  const { document } = dom.window;

  assert.equal(document.documentElement.dataset.htrView, "list");
  assert.equal(document.documentElement.dataset.htrTheme, "dark");
  assert.equal(document.documentElement.dataset.htrDensity, "compact");
  assert.equal(document.documentElement.dataset.htrReady, "true");
  assert.ok(document.getElementById("htr-control-root"));
  assert.match(
    document.querySelector("#htr-theme-style").textContent,
    /\[data-test-id="framework-data-table"\]/,
  );

  const firstRow = document.querySelector('[data-test-id="row-1000"]');
  const secondRow = document.querySelector('[data-test-id="row-1001"]');
  const thirdRow = document.querySelector('[data-test-id="row-1002"]');
  assert.equal(firstRow.dataset.htrStatus, "waiting-us");
  assert.equal(secondRow.dataset.htrStatus, "waiting-contact");
  assert.equal(thirdRow.dataset.htrStatus, "closed");
  assert.equal(firstRow.dataset.htrPriority, "high");
  assert.equal(
    firstRow.querySelector('[data-test-id^="label-cell-formatted-property-status-"]').dataset.htrTone,
    "waiting-us",
  );
  assert.equal(
    firstRow.querySelector('[data-test-id^="label-cell-formatted-property-priority-"]').dataset.htrTone,
    "high",
  );
  assert.ok(document.querySelector(".htr-list-stack"));
  assert.ok(document.querySelector(".htr-list-datawell"));
  assert.ok(document.querySelector(".htr-list-toolbar"));
  assert.ok(document.querySelector(".htr-list-table"));
  assert.equal(store.size, 0);

  dom.window.close();
});

test("settings panel changes theme and persists the choice", async () => {
  const { dom, store } = await loadFixture(
    "tickets-list.html",
    "https://app.hubspot.com/contacts/123/objects/0-5/views/456/list",
  );
  const { document } = dom.window;
  const host = document.getElementById("htr-control-root");
  const shadow = host.shadowRoot;
  const trigger = shadow.querySelector(".htr-trigger");
  const light = shadow.querySelector(
    'button[data-setting="theme"][data-value="light"]',
  );
  const comfortable = shadow.querySelector(
    'button[data-setting="density"][data-value="comfortable"]',
  );
  const hiddenAnalytics = shadow.querySelector(
    'button[data-setting="analytics"][data-value="hidden"]',
  );
  const standardNavigation = shadow.querySelector(
    'button[data-setting="navigation"][data-value="standard"]',
  );

  assert.equal(trigger.title, "Open theme and layout settings");
  assert.equal(shadow.querySelector(".htr-reset").textContent, "Restore defaults");
  assert.equal(
    shadow.querySelector('[data-setting="navigation"]')
      .parentElement.getAttribute("aria-describedby"),
    "htr-navigation-hint",
  );
  assert.match(
    shadow.querySelector("#htr-navigation-hint").textContent,
    /follows HubSpot/,
  );

  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(shadow.querySelector(".htr-panel").hidden, false);

  light.click();
  assert.equal(document.documentElement.dataset.htrTheme, "light");
  assert.equal(light.getAttribute("aria-pressed"), "true");
  assert.equal(
    store.get("hubspot-ticket-refined.settings").theme,
    "light",
  );

  comfortable.click();
  hiddenAnalytics.click();
  standardNavigation.click();
  assert.equal(document.documentElement.dataset.htrDensity, "comfortable");
  assert.equal(document.documentElement.dataset.htrAnalytics, "hidden");
  assert.equal(document.documentElement.dataset.htrNavigation, "standard");
  assert.deepEqual(store.get("hubspot-ticket-refined.settings"), {
    theme: "light",
    density: "comfortable",
    analytics: "hidden",
    navigation: "standard",
  });

  const controls = [...shadow.querySelectorAll("button")];
  assert.ok(controls.every((button) => button.type === "button"));
  assert.equal(
    shadow.querySelector(".htr-panel").getAttribute("aria-label"),
    "HubSpot Ticket Refined settings",
  );

  dom.window.close();
});

test("current collapsed ticket list works without a rendered data well", async () => {
  const { dom } = await loadFixture(
    "tickets-list.html",
    "https://app.hubspot.com/contacts/123/objects/0-5/views/456/list",
    {
      beforeScript(document) {
        const dataWell = document.querySelector('[data-test-id="data-well"]');
        const shell = document.createElement("div");
        shell.innerHTML = '<div data-test-id="data-well-collapsible"></div>';
        dataWell.replaceWith(shell);
      },
    },
  );
  const { document } = dom.window;

  assert.ok(document.querySelector(".htr-list-stack"));
  assert.ok(document.querySelector(".htr-list-datawell"));
  assert.equal(document.documentElement.dataset.htrAnalyticsAvailable, "false");
  assert.equal(
    document.querySelector('[data-test-id="framework-data-table"]').dataset
      .htrColumns,
    "8",
  );
  assert.match(source, /data-htr-analytics-available="false"/);
  assert.match(source, /--global-nav-vertical-nav-width:\s*64px/);
  assert.doesNotMatch(source, /--htr-nav-width/);

  dom.window.close();
});

test("ticket record activates the three-column treatment", async () => {
  const { dom } = await loadFixture(
    "ticket-record.html",
    "https://app.hubspot.com/contacts/123/record/0-5/789",
    {
      beforeScript(document) {
        const title = document.querySelector(
          '[data-test-id="highlight-record-label"]',
        );
        title.textContent =
          "Configure a new DICOM destination after replacing the acquisition workstation and verify the first study reaches the archive";

        const currentStatus = document.querySelector(
          '[data-test-id^="highlight-property-display-hs_pipeline_stage"]',
        );
        currentStatus?.remove();
        const status = document.createElement("div");
        status.dataset.testId = "highlight-property-item-hs_pipeline_stage";
        status.innerHTML =
          '<span>Ticket status:</span><div data-test-id="property-input-hs_pipeline_stage"><span>Waiting on contact</span></div>';
        title.parentElement.append(status);

        const highlight = document.createElement("div");
        highlight.dataset.testId = "crm-data-highlights-item";
        highlight.innerHTML =
          '<p>Ticket status</p><span>Waiting on contact (Support Pipeline)</span>';
        document.querySelector(".middle").append(highlight);
      },
    },
  );
  const { document } = dom.window;

  assert.equal(document.documentElement.dataset.htrView, "record");
  assert.ok(document.querySelector('[data-test-id="left-sidebar"]'));
  assert.ok(document.querySelector('[data-test-id="crm-events-viz-timeline"]'));
  assert.ok(document.querySelector('[data-test-id="records-right-sidebar"]'));
  assert.match(source, /#record-page-left-sidebar/);
  assert.match(source, /\[data-test-id="timeline-preview-event"\]/);
  assert.match(source, /SanitizedText__StyledText-/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /@media \(forced-colors: active\)/);
  assert.match(source, /:focus-visible/);
  assert.match(source, /\[data-test-id="mini-highlight-container"\]/);
  assert.match(source, /background-image: none/);
  assert.match(
    source,
    /data-htr-view="record"\] \[class\*="Overhang__StyledOverhang-"\]/,
  );
  assert.match(source, /data-test-id\^="timeline-scroll-fade-"/);
  assert.match(source, /ButtonLabel__StyledLabel-/);
  assert.match(source, /CollapsibleListCardFormatter__DragGripTarget-/);
  const title = document.querySelector('[data-test-id="highlight-record-label"]');
  assert.equal(title.dataset.htrLongTitle, "true");
  assert.equal(title.title, title.textContent);
  assert.equal(
    document.querySelector(
      '[data-test-id="property-input-hs_pipeline_stage"] span',
    ).dataset.htrTone,
    "waiting-contact",
  );
  assert.equal(
    document.querySelector('[data-test-id="crm-data-highlights-item"] span')
      .dataset.htrTone,
    "waiting-contact",
  );

  dom.window.close();
});

test("host selectors avoid captured generated class suffixes", () => {
  for (const generatedClass of ["eNptcf", "gtkHAV", "jjUIcz", "bsTQLT"]) {
    assert.doesNotMatch(source, new RegExp(`\\.${generatedClass}\\b`));
  }
  assert.match(source, /data-test-id\^="card-wrapper-"/);
  assert.match(source, /data-test-id="crm-lite-toolbar-wrapper"/);
});

test("theme tokens meet text contrast and radius rules", () => {
  const pairs = [
    ["#dce6f0", "#0f1d2c"],
    ["#a8b6c5", "#0f1d2c"],
    ["#8293a6", "#0f1d2c"],
    ["#243348", "#ffffff"],
    ["#586a7f", "#ffffff"],
    ["#64748b", "#ffffff"],
    ["#f8fbff", "#0b1726"],
    ["#dbe5ee", "#102238"],
    ["#67e4d7", "#153a47"],
    ["#925800", "#fff3dc"],
    ["#2567a9", "#e6f1fb"],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet WCAG AA`,
    );
  }

  assert.doesNotMatch(source, /border-radius:\s*(?:50%|999(?:px|rem)?)/);
  assert.doesNotMatch(source, /(?:linear|radial)-gradient/);
});

async function loadFixture(name, url, options = {}) {
  const html = await readFile(
    path.join(projectRoot, "tests", "fixtures", name),
    "utf8",
  );
  const store = new Map();
  const dom = new JSDOM(html, {
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url,
  });
  const { window } = dom;
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  window.GM_addStyle = (css) => {
    const style = window.document.createElement("style");
    style.textContent = css;
    window.document.head.append(style);
    return style;
  };
  window.GM_getValue = (key, fallback) => store.get(key) ?? fallback;
  window.GM_setValue = (key, value) => store.set(key, structuredClone(value));
  window.GM_registerMenuCommand = () => {};
  options.beforeScript?.(window.document);
  window.eval(source);
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  return { dom, store };
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)
      .map((value) => Number.parseInt(value, 16) / 255)
      .map((value) =>
        value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4,
      );
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}
