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

  const controls = [...shadow.querySelectorAll("button")];
  assert.ok(controls.every((button) => button.type === "button"));
  assert.equal(
    shadow.querySelector(".htr-panel").getAttribute("aria-label"),
    "HubSpot Ticket Refined settings",
  );

  dom.window.close();
});

test("ticket record activates the three-column treatment", async () => {
  const { dom } = await loadFixture(
    "ticket-record.html",
    "https://app.hubspot.com/contacts/123/record/0-5/789",
  );
  const { document } = dom.window;

  assert.equal(document.documentElement.dataset.htrView, "record");
  assert.ok(document.querySelector('[data-test-id="left-sidebar"]'));
  assert.ok(document.querySelector('[data-test-id="crm-events-viz-timeline"]'));
  assert.ok(document.querySelector('[data-test-id="records-right-sidebar"]'));
  assert.match(source, /#record-page-left-sidebar/);
  assert.match(source, /\[data-test-id="timeline-preview-event"\]/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(source, /:focus-visible/);

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
    ["#edf3f8", "#111a27"],
    ["#9cabbc", "#111a27"],
    ["#1f2937", "#ffffff"],
    ["#5f6c7b", "#ffffff"],
    ["#f8fafc", "#111827"],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${foreground} on ${background} must meet WCAG AA`,
    );
  }

  assert.doesNotMatch(source, /border-radius:\s*(?:50%|999(?:px|rem)?)/);
});

async function loadFixture(name, url) {
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
