// ==UserScript==
// @name         HubSpot Ticket Refined
// @namespace    https://github.com/SysAdminDoc/HubSpot-Ticket-Refined
// @version      0.2.0
// @description  A premium, information-dense theme for HubSpot ticket workspaces.
// @author       SysAdminDoc
// @license      MIT
// @match        https://app.hubspot.com/contacts/*/objects/0-5/*
// @match        https://app.hubspot.com/contacts/*/record/0-5/*
// @match        https://app.hubspot.com/*/tickets/*
// @match        https://app.hubspot.com/help-desk/*
// @run-at       document-start
// @inject-into  content
// @noframes
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/SysAdminDoc/HubSpot-Ticket-Refined/main/src/HubSpot-Ticket-Refined.user.js
// @downloadURL  https://raw.githubusercontent.com/SysAdminDoc/HubSpot-Ticket-Refined/main/src/HubSpot-Ticket-Refined.user.js
// ==/UserScript==

(function hubSpotTicketRefined() {
  "use strict";

  const VERSION = "0.2.0";
  const STORAGE_KEY = "hubspot-ticket-refined.settings";
  const ROOT_CLASS = "htr-active";
  const CONTROL_ID = "htr-control-root";
  const STYLE_ID = "htr-theme-style";
  const DEFAULTS = Object.freeze({
    theme: "dark",
    density: "compact",
    analytics: "compact",
    navigation: "slim",
  });
  const OPTIONS = Object.freeze({
    theme: ["dark", "light", "auto"],
    density: ["compact", "comfortable"],
    analytics: ["compact", "full", "hidden"],
    navigation: ["slim", "standard"],
  });
  const LABELS = Object.freeze({
    dark: "Midnight",
    light: "Porcelain",
    auto: "Automatic",
    compact: "Compact",
    comfortable: "Comfortable",
    full: "Full",
    hidden: "Hidden",
    slim: "Slim",
    standard: "Standard",
  });

  let settings = readSettings();
  let refreshTimer = 0;
  let panelApi = null;
  let lastUrl = location.href;
  let observer = null;

  function activateRoot() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.classList.add(ROOT_CLASS);
    root.dataset.htrVersion = VERSION;
    applySettingsToRoot();
  }

  function applySettingsToRoot() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.dataset.htrThemePreference = settings.theme;
    root.dataset.htrTheme = resolveTheme(settings.theme);
    root.dataset.htrDensity = settings.density;
    root.dataset.htrAnalytics = settings.analytics;
    root.dataset.htrNavigation = settings.navigation;
    root.style.colorScheme = root.dataset.htrTheme;
    if (panelApi) {
      panelApi.sync(settings);
    }
  }

  function resolveTheme(preference) {
    if (preference !== "auto") {
      return preference;
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function watchAutomaticTheme() {
    if (!window.matchMedia) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if (settings.theme === "auto") {
        applySettingsToRoot();
      }
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
    } else if (typeof media.addListener === "function") {
      media.addListener(update);
    }
  }

  function readSettings() {
    let stored = null;
    try {
      if (typeof GM_getValue === "function") {
        stored = GM_getValue(STORAGE_KEY, null);
      }
      if (!stored) {
        stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      }
    } catch (_error) {
      stored = null;
    }

    const next = { ...DEFAULTS };
    if (stored && typeof stored === "object") {
      for (const key of Object.keys(DEFAULTS)) {
        if (OPTIONS[key].includes(stored[key])) {
          next[key] = stored[key];
        }
      }
    }
    return next;
  }

  function saveSettings() {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(STORAGE_KEY, settings);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      }
    } catch (_error) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (_storageError) {
        panelApi?.toast("Couldn't save this preference");
      }
    }
  }

  function updateSetting(key, value, announce = true) {
    if (!OPTIONS[key]?.includes(value)) {
      return;
    }
    settings = { ...settings, [key]: value };
    saveSettings();
    applySettingsToRoot();
    scheduleRefresh();
    if (announce) {
      panelApi?.toast(`${formatKey(key)}: ${LABELS[value]}`);
    }
  }

  function resetSettings() {
    settings = { ...DEFAULTS };
    saveSettings();
    applySettingsToRoot();
    scheduleRefresh();
    panelApi?.toast("Default style restored");
  }

  function formatKey(key) {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  function cycleSetting(key) {
    const values = OPTIONS[key];
    const nextIndex = (values.indexOf(settings[key]) + 1) % values.length;
    updateSetting(key, values[nextIndex]);
  }

  function registerMenus() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }
    GM_registerMenuCommand("Open Refined settings", () => {
      ensurePanel();
      panelApi?.open();
    });
    GM_registerMenuCommand("Cycle color mode", () => cycleSetting("theme"));
    GM_registerMenuCommand("Toggle row density", () => cycleSetting("density"));
    GM_registerMenuCommand("Cycle analytics shelf", () =>
      cycleSetting("analytics"),
    );
  }

  function addThemeStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    if (typeof GM_addStyle === "function") {
      const style = GM_addStyle(THEME_CSS);
      if (style && !style.id) {
        style.id = STYLE_ID;
      }
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = THEME_CSS;
    (document.head || document.documentElement).append(style);
  }

  function startWhenReady() {
    if (document.body) {
      initializePage();
      return;
    }
    document.addEventListener("DOMContentLoaded", initializePage, { once: true });
  }

  function initializePage() {
    activateRoot();
    ensurePanel();
    refreshPage();
    if (!observer) {
      observer = new MutationObserver(scheduleRefresh);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }

  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshPage, 120);
  }

  function refreshPage() {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      panelApi?.close();
    }
    root.dataset.htrView = detectView();
    if (root.dataset.htrView === "list") {
      tagListLayout();
    } else if (root.dataset.htrView === "record") {
      delete root.dataset.htrListFrame;
      tagRecordValues();
    } else {
      delete root.dataset.htrListFrame;
    }
    tagTicketRows();
    root.dataset.htrReady = "true";
  }

  function detectView() {
    if (
      /\/record\/0-5\//.test(location.pathname) ||
      document.querySelector('[data-test-id="left-sidebar"]')
    ) {
      return "record";
    }
    if (
      /\/objects\/0-5\//.test(location.pathname) ||
      document.querySelector('[data-test-id="framework-data-table"]')
    ) {
      return "list";
    }
    return "tickets";
  }

  function tagTicketRows() {
    const stageCells = document.querySelectorAll(
      '[data-test-id^="cell-0-5-hs_pipeline_stage-"]',
    );
    for (const cell of stageCells) {
      const row = cell.closest("tr");
      if (!row) {
        continue;
      }
      const status = normalizeStatus(cell.textContent || "");
      if (status) {
        row.dataset.htrStatus = status;
        decorateSemanticValue(cell, status);
      } else {
        delete row.dataset.htrStatus;
      }
    }

    const priorityCells = document.querySelectorAll(
      '[data-test-id^="cell-0-5-hs_ticket_priority-"]',
    );
    for (const cell of priorityCells) {
      const row = cell.closest("tr");
      if (!row) {
        continue;
      }
      const priority = normalizePriority(cell.textContent || "");
      if (priority) {
        row.dataset.htrPriority = priority;
        decorateSemanticValue(cell, priority);
      } else {
        delete row.dataset.htrPriority;
      }
    }

    tagColumnValues("status", "htrStatus", normalizeStatus);
    tagColumnValues("priority", "htrPriority", normalizePriority);
  }

  function tagColumnValues(headerLabel, rowKey, normalize) {
    for (const table of document.querySelectorAll(
      '[data-test-id="framework-data-table"]',
    )) {
      const headers = [...table.querySelectorAll("thead th")];
      const columnIndex = headers.findIndex((header) =>
        (header.textContent || "").toLowerCase().includes(headerLabel),
      );
      if (columnIndex < 0) {
        continue;
      }
      for (const row of table.querySelectorAll("tbody tr")) {
        const cell = row.cells[columnIndex];
        const tone = normalize(cell?.textContent || "");
        if (!cell || !tone) {
          continue;
        }
        row.dataset[rowKey] = tone;
        cell.dataset.htrSemanticCell = headerLabel;
        decorateSemanticValue(cell, tone);
      }
    }
  }

  function tagListLayout() {
    const sections = [
      ["datawell", document.querySelector('[data-test-id="data-well"]')],
      ["toolbar", document.querySelector('[data-test-id="crm-lite-toolbar-wrapper"]')],
      ["table", document.querySelector('[data-test-id="framework-data-table-container"]')],
    ];
    const nodes = sections.map(([, node]) => node).filter(Boolean);
    if (nodes.length !== sections.length) {
      return;
    }

    const stack = findCommonAncestor(nodes);
    const main = stack?.closest("main");
    if (!stack || !main) {
      return;
    }

    stack.classList.add("htr-list-stack", "htr-list-shell-layer");
    document.documentElement.dataset.htrListFrame =
      stack.parentElement === main ? "direct" : "nested";
    let layer = stack.parentElement;
    while (layer && layer !== main) {
      layer.classList.add("htr-list-shell-layer");
      layer = layer.parentElement;
    }
    const shell = directChildOf(main, stack);
    shell?.classList.add("htr-list-shell");
    for (const [name, node] of sections) {
      directChildOf(stack, node)?.classList.add(`htr-list-${name}`);
    }
  }

  function findCommonAncestor(nodes) {
    let ancestor = nodes[0]?.parentElement || null;
    while (ancestor && !nodes.every((node) => ancestor.contains(node))) {
      ancestor = ancestor.parentElement;
    }
    return ancestor;
  }

  function directChildOf(ancestor, node) {
    let current = node;
    while (current && current.parentElement !== ancestor) {
      current = current.parentElement;
    }
    return current;
  }

  function decorateSemanticValue(cell, tone) {
    const token =
      cell.querySelector('[data-test-id^="label-cell-formatted-property-"]') ||
      cell.querySelector('[data-test-id*="property-value"]') ||
      cell.firstElementChild;
    if (token) {
      token.dataset.htrTone = tone;
    }
  }

  function tagRecordValues() {
    const values = document.querySelectorAll(
      '[data-test-id^="highlight-property-display-hs_pipeline_stage"]',
    );
    for (const value of values) {
      const tone = normalizeStatus(value.textContent || "");
      if (tone) {
        value.dataset.htrTone = tone;
      }
    }
  }

  function normalizeStatus(value) {
    const text = value.toLowerCase();
    if (text.includes("waiting on contact")) {
      return "waiting-contact";
    }
    if (text.includes("waiting on us")) {
      return "waiting-us";
    }
    if (text.includes("closed")) {
      return "closed";
    }
    if (text.includes("new") || text.includes("open")) {
      return "open";
    }
    return "";
  }

  function normalizePriority(value) {
    const text = value.trim().toLowerCase();
    if (text.includes("high")) {
      return "high";
    }
    if (text.includes("medium")) {
      return "medium";
    }
    if (text.includes("low")) {
      return "low";
    }
    return "";
  }

  function ensurePanel() {
    if (panelApi || !document.body) {
      return;
    }
    const existing = document.getElementById(CONTROL_ID);
    if (existing) {
      return;
    }

    const host = document.createElement("div");
    host.id = CONTROL_ID;
    host.setAttribute("data-htr-version", VERSION);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.append(style);

    const shell = element("div", "htr-shell");
    const trigger = element("button", "htr-trigger", "Refine");
    trigger.type = "button";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "htr-panel");
    trigger.title = "Open theme and layout settings";

    const panel = element("section", "htr-panel");
    panel.id = "htr-panel";
    panel.setAttribute("aria-label", "HubSpot Ticket Refined settings");
    panel.hidden = true;

    const header = element("header", "htr-header");
    const titleWrap = element("div", "htr-title-wrap");
    const title = element("strong", "htr-title", "Ticket Refined");
    const subtitle = element("span", "htr-subtitle", `Version ${VERSION}`);
    titleWrap.append(title, subtitle);
    const close = element("button", "htr-close", "Close");
    close.type = "button";
    close.setAttribute("aria-label", "Close Refined settings");
    header.append(titleWrap, close);
    panel.append(header);

    const groups = {};
    groups.theme = createOptionGroup("Color mode", "theme", [
      ["dark", "Midnight"],
      ["light", "Porcelain"],
      ["auto", "Automatic"],
    ]);
    groups.density = createOptionGroup("Row density", "density", [
      ["compact", "Compact"],
      ["comfortable", "Comfortable"],
    ]);
    groups.analytics = createOptionGroup("Analytics shelf", "analytics", [
      ["compact", "Compact"],
      ["full", "Full"],
      ["hidden", "Hidden"],
    ]);
    groups.navigation = createOptionGroup("Navigation", "navigation", [
      ["slim", "Slim"],
      ["standard", "Standard"],
    ]);
    panel.append(
      groups.theme,
      groups.density,
      groups.analytics,
      groups.navigation,
    );

    const footer = element("footer", "htr-footer");
    const reset = element("button", "htr-reset", "Restore defaults");
    reset.type = "button";
    const note = element(
      "span",
      "htr-note",
      "Applies only to HubSpot ticket pages.",
    );
    footer.append(reset, note);
    panel.append(footer);

    const toast = element("div", "htr-toast");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.hidden = true;

    shell.append(panel, trigger, toast);
    shadow.append(shell);
    document.body.append(host);

    let toastTimer = 0;
    const api = {
      open() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        host.dataset.open = "true";
        close.focus({ preventScroll: true });
      },
      close() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        delete host.dataset.open;
      },
      sync(nextSettings) {
        for (const [key, value] of Object.entries(nextSettings)) {
          for (const button of shadow.querySelectorAll(
            `[data-setting="${key}"]`,
          )) {
            const selected = button.dataset.value === value;
            button.dataset.selected = String(selected);
            button.setAttribute("aria-pressed", String(selected));
          }
        }
      },
      toast(message) {
        window.clearTimeout(toastTimer);
        toast.textContent = message;
        toast.hidden = false;
        toast.dataset.visible = "true";
        toastTimer = window.setTimeout(() => {
          delete toast.dataset.visible;
          toast.hidden = true;
        }, 2200);
      },
    };
    panelApi = api;
    api.sync(settings);

    trigger.addEventListener("click", () => {
      if (panel.hidden) {
        api.open();
      } else {
        api.close();
      }
    });
    close.addEventListener("click", () => api.close());
    reset.addEventListener("click", resetSettings);
    shadow.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-setting]");
      if (!button) {
        return;
      }
      updateSetting(button.dataset.setting, button.dataset.value);
    });
  }

  function createOptionGroup(label, setting, entries) {
    const group = element("fieldset", "htr-group");
    const legend = element("legend", "htr-legend", label);
    const options = element("div", "htr-options");
    options.dataset.columns = String(entries.length);
    for (const [value, text] of entries) {
      const button = element("button", "htr-option", text);
      button.type = "button";
      button.dataset.setting = setting;
      button.dataset.value = value;
      button.setAttribute("aria-pressed", "false");
      options.append(button);
    }
    group.append(legend, options);
    return group;
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  const THEME_CSS = `
html.htr-active {
  --htr-font: Inter, "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
  --htr-row-height: 34px;
  --htr-nav-width: 188px;
  --htr-left-width: 340px;
  --htr-right-width: 324px;
  --htr-content-pad: 18px;
  --htr-radius-xs: 4px;
  --htr-radius-sm: 6px;
  --htr-radius-md: 8px;
  --htr-radius-lg: 10px;
  --htr-speed: 150ms;
  --global-nav-vertical-nav-width: var(--htr-nav-width) !important;
  color-scheme: dark;
  font-family: var(--htr-font) !important;
}

html.htr-active[data-htr-theme="dark"] {
  --htr-canvas: #09131f;
  --htr-chrome: #07111c;
  --htr-sidebar: #0a1827;
  --htr-surface: #0f1d2c;
  --htr-surface-subtle: #111f2f;
  --htr-surface-raised: #15263a;
  --htr-surface-hover: #1a3046;
  --htr-surface-selected: #123b3f;
  --htr-text: #dce6f0;
  --htr-text-strong: #f8fbff;
  --htr-muted: #a8b6c5;
  --htr-faint: #8293a6;
  --htr-border: #283c50;
  --htr-border-strong: #3b536b;
  --htr-accent: #40d7c6;
  --htr-accent-strong: #21bfae;
  --htr-accent-soft: #12353a;
  --htr-accent-ink: #062f2b;
  --htr-link: #63d7cb;
  --htr-focus: #65bff7;
  --htr-success: #65d3a3;
  --htr-success-soft: #132d2b;
  --htr-warning: #f0bd66;
  --htr-warning-soft: #352a1a;
  --htr-danger: #f38aa5;
  --htr-danger-soft: #361d27;
  --htr-info: #72b8f5;
  --htr-info-soft: #172b3f;
  --htr-chrome-text: #f5f8fc;
  --htr-chrome-muted: #bec8d4;
  --htr-nav-text: #d5dee8;
  --htr-nav-hover: #12283d;
  --htr-nav-active: #123640;
  --htr-nav-accent: #67e4d7;
  --htr-shadow: 0 18px 42px rgb(0 0 0 / 34%);
  --htr-shadow-soft: 0 6px 18px rgb(0 0 0 / 18%);
  color-scheme: dark;
}

html.htr-active[data-htr-theme="light"] {
  --htr-canvas: #f5f7fa;
  --htr-chrome: #0b1726;
  --htr-sidebar: #102238;
  --htr-surface: #ffffff;
  --htr-surface-subtle: #fbfcfe;
  --htr-surface-raised: #f6f8fb;
  --htr-surface-hover: #edf5f6;
  --htr-surface-selected: #def2ef;
  --htr-text: #243348;
  --htr-text-strong: #0d1b2d;
  --htr-muted: #586a7f;
  --htr-faint: #64748b;
  --htr-border: #dbe3eb;
  --htr-border-strong: #becad7;
  --htr-accent: #087b76;
  --htr-accent-strong: #0a8f87;
  --htr-accent-soft: #dcf3ef;
  --htr-accent-ink: #f4fffd;
  --htr-link: #075f7d;
  --htr-focus: #006eb8;
  --htr-success: #1f7a55;
  --htr-success-soft: #e4f5ec;
  --htr-warning: #925800;
  --htr-warning-soft: #fff3dc;
  --htr-danger: #b82d4d;
  --htr-danger-soft: #fde8ee;
  --htr-info: #2567a9;
  --htr-info-soft: #e6f1fb;
  --htr-chrome-text: #f8fbff;
  --htr-chrome-muted: #c1cbd6;
  --htr-nav-text: #dbe5ee;
  --htr-nav-hover: #183149;
  --htr-nav-active: #153a47;
  --htr-nav-accent: #67e4d7;
  --htr-shadow: 0 18px 42px rgb(15 23 42 / 15%);
  --htr-shadow-soft: 0 4px 14px rgb(15 23 42 / 8%);
  color-scheme: light;
}

html.htr-active[data-htr-density="comfortable"] {
  --htr-row-height: 42px;
  --htr-left-width: 356px;
  --htr-right-width: 336px;
}

html.htr-active[data-htr-navigation="standard"] {
  --htr-nav-width: 220px;
}

html.htr-active,
html.htr-active body,
html.htr-active #root,
html.htr-active .page,
html.htr-active main,
html.htr-active #crm {
  background: var(--htr-canvas) !important;
  color: var(--htr-text) !important;
  font-family: var(--htr-font) !important;
}

html.htr-active body {
  font-size: 13px !important;
  line-height: 1.4 !important;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

html.htr-active ::selection {
  background: var(--htr-accent-soft);
  color: var(--htr-text-strong);
}

html.htr-active :is(a, [role="link"]) {
  color: var(--htr-link) !important;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

html.htr-active :is(a, [role="link"]):hover {
  color: var(--htr-accent) !important;
}

html.htr-active :is(h1, h2, h3, h4, strong) {
  color: var(--htr-text-strong) !important;
}

html.htr-active :is(h1, h2, h3) {
  letter-spacing: -0.018em !important;
}

html.htr-active :is(a, button, input, textarea, select, [role="button"], [tabindex]):focus-visible {
  outline: 2px solid var(--htr-focus) !important;
  outline-offset: 2px !important;
  box-shadow: none !important;
}

html.htr-active :is(button, [role="button"], input, textarea, select) {
  border-radius: var(--htr-radius-sm) !important;
  font-family: var(--htr-font) !important;
}

html.htr-active :is(input, textarea, select) {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active :is(input, textarea)::placeholder {
  color: var(--htr-faint) !important;
  opacity: 1 !important;
}

html.htr-active :is(button, [role="button"]) {
  transition: background-color var(--htr-speed) ease,
    border-color var(--htr-speed) ease,
    color var(--htr-speed) ease,
    box-shadow var(--htr-speed) ease,
    transform var(--htr-speed) ease !important;
}

html.htr-active :is(button, [role="button"]):not(:disabled):active {
  transform: translateY(1px);
}

html.htr-active :is(button, input, textarea, select, [role="button"]):disabled,
html.htr-active [aria-disabled="true"] {
  cursor: not-allowed !important;
  opacity: 0.58 !important;
}

html.htr-active :is([role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"]) {
  background: var(--htr-surface-raised) !important;
  border: 1px solid var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
  box-shadow: var(--htr-shadow) !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] {
  background: var(--htr-chrome) !important;
  border-bottom: 1px solid var(--htr-border) !important;
  color: var(--htr-chrome-text) !important;
  box-shadow: none !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] :is(a, button, [role="button"]) {
  color: var(--htr-chrome-text) !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] :is(strong, span) {
  color: var(--htr-chrome-text) !important;
}

html.htr-active #hs-global-toolbar-icons {
  background: transparent !important;
}

html.htr-active [data-test-id="global-search-input-react"] {
  height: 32px !important;
  background: var(--htr-chrome) !important;
  border-color: var(--htr-chrome-muted) !important;
  color: var(--htr-chrome-text) !important;
  box-shadow: none !important;
}

html.htr-active [data-test-id="global-search-input-react"]::placeholder {
  color: var(--htr-chrome-muted) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] {
  width: var(--htr-nav-width) !important;
  min-width: var(--htr-nav-width) !important;
  background: var(--htr-sidebar) !important;
  border-right: 1px solid var(--htr-border) !important;
  color: var(--htr-nav-text) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu {
  width: 100% !important;
  min-width: 0 !important;
  background: transparent !important;
}

html.htr-active [data-test-id="hs-vertical-nav-content"] > button {
  background: var(--htr-sidebar) !important;
  color: var(--htr-nav-text) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] :is(a, button, [role="button"]) {
  min-height: 38px !important;
  border-radius: var(--htr-radius-sm) !important;
  color: var(--htr-nav-text) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] :is(a, button, [role="button"]):hover {
  background: var(--htr-nav-hover) !important;
  color: var(--htr-chrome-text) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] [aria-current="page"],
html.htr-active [data-test-id="hs-vertical-nav"] [aria-selected="true"],
html.htr-active [data-test-id="hs-vertical-nav"] [data-nav-item-id].isHighlighted > button,
html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu-item.isHighlighted > :is(a, button) {
  background: var(--htr-nav-active) !important;
  color: var(--htr-nav-accent) !important;
  box-shadow: inset 3px 0 var(--htr-accent) !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu-item.isHighlighted > :is(a, button) :is(div, span, svg) {
  color: inherit !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu-item.isHighlighted > :is(a, button) > :first-child {
  background: transparent !important;
  border-radius: 0 !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu-item.isHighlighted > :is(a, button) > :first-child::before {
  content: none !important;
  background: transparent !important;
}

html.htr-active[data-htr-view="list"] main {
  margin: 0 !important;
  padding: 0 !important;
  background: var(--htr-surface) !important;
  border-radius: 0 !important;
}

html.htr-active[data-htr-view="list"][data-htr-list-frame="nested"] main {
  width: calc(100% + 32px) !important;
  height: calc(100% + 32px) !important;
  margin: -16px !important;
}

html.htr-active[data-htr-view="list"] main > div {
  border-radius: 0 !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="list"] .htr-list-shell {
  width: 100% !important;
  max-width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  background: var(--htr-surface) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="list"] .htr-list-shell-layer {
  max-width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: var(--htr-surface) !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="list"] .htr-list-stack {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  background: var(--htr-surface) !important;
}

html.htr-active[data-htr-view="list"] .htr-list-datawell {
  order: 3 !important;
  flex: 0 0 auto !important;
  min-width: 0 !important;
}

html.htr-active[data-htr-view="list"] .htr-list-toolbar {
  order: 4 !important;
  flex: 0 0 auto !important;
  min-width: 0 !important;
}

html.htr-active[data-htr-view="list"] .htr-list-table {
  order: 5 !important;
  flex: 1 1 auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

html.htr-active[data-htr-view="list"] main > :is(div, section),
html.htr-active[data-htr-view="list"] main header[role="presentation"],
html.htr-active[data-htr-view="list"] main [role="banner"] {
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="list"] main header[role="banner"] {
  min-height: 68px !important;
  padding-inline: var(--htr-content-pad) !important;
  border-bottom: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="list"] main header[role="banner"] h1 {
  margin: 0 !important;
  font-size: 24px !important;
  font-weight: 720 !important;
  line-height: 1.15 !important;
}

html.htr-active[data-htr-view="list"] main header[role="banner"] :is(
  [data-test-id="add-objects-button"],
  [data-test-id="crm-index-ui-add-objects-button"]
) {
  min-height: 34px !important;
  padding-inline: 14px !important;
  background: var(--htr-accent) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-accent-ink) !important;
  font-weight: 700 !important;
  box-shadow: var(--htr-shadow-soft) !important;
}

html.htr-active [data-test-id="view-tabs-container-lite"] {
  min-height: 42px !important;
  padding-inline: var(--htr-content-pad) !important;
  border-bottom: 1px solid var(--htr-border) !important;
  background: var(--htr-surface) !important;
}

html.htr-active [data-test-id="view-tab-menu"] {
  min-height: 36px !important;
  color: var(--htr-muted) !important;
  font-weight: 620 !important;
  box-shadow: inset 0 -2px var(--htr-accent) !important;
}

html.htr-active [data-test-id="crm-lite-toolbar-wrapper"] {
  display: flex !important;
  align-items: center !important;
  min-height: 52px !important;
  padding: 8px var(--htr-content-pad) !important;
  gap: 8px !important;
  background: var(--htr-surface) !important;
  border-bottom: 1px solid var(--htr-border) !important;
}

html.htr-active [data-test-id="toolbar"] {
  flex: 1 1 auto !important;
  gap: 7px !important;
}

html.htr-active :is(
  [data-test-id="compact-toolbar-search"],
  [data-test-id="compact-toolbar-filter-toggle"],
  [data-test-id="toolbar-sort-button"],
  [data-test-id="compact-toolbar-pipeline-switcher"],
  [data-test-id="compact-toolbar-visualization-selector"],
  [data-test-id="compact-toolbar-settings-toggle"],
  [data-test-id="compact-toolbar-collapse-expand-toggle"]
) {
  min-height: 32px !important;
  background: var(--htr-surface) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
  box-shadow: none !important;
}

html.htr-active :is(
  [data-test-id="toolbar"],
  [data-test-id="quick-filters"]
) button:hover {
  background: var(--htr-surface-hover) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-accent) !important;
}

html.htr-active [data-test-id="quick-filters"] button {
  min-height: 30px !important;
  background: var(--htr-surface) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="compact-toolbar-search-input"] {
  height: 32px !important;
}

html.htr-active [data-test-id="quick-filters"] {
  flex: 0 1 auto !important;
  flex-wrap: nowrap !important;
  gap: 6px !important;
  min-width: 0 !important;
  min-height: 30px !important;
  overflow: auto hidden !important;
}

html.htr-active[data-htr-density="compact"] [data-test-id="quick-filters"] {
  display: none !important;
}

html.htr-active[data-htr-view="list"][data-htr-density="compact"] .htr-list-toolbar {
  height: 52px !important;
  min-height: 52px !important;
  max-height: 52px !important;
  overflow: hidden !important;
}

html.htr-active [data-test-id="data-well"] {
  order: 3;
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 0 !important;
  margin: 10px var(--htr-content-pad) !important;
  padding: 0 !important;
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-radius: var(--htr-radius-sm) !important;
  overflow: hidden !important;
  transition: max-height 180ms ease, opacity 180ms ease !important;
}

html.htr-active [data-test-id="crm-lite-toolbar-wrapper"] {
  order: 4;
}

html.htr-active [data-test-id="framework-data-table-container"] {
  order: 5;
}

html.htr-active [data-test-id="viz-sync-footer"] {
  order: 6;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="data-well"] {
  height: 76px !important;
  min-height: 76px !important;
  max-height: 78px !important;
}

html.htr-active[data-htr-view="list"][data-htr-analytics="compact"] .htr-list-datawell:not([data-test-id="data-well"]),
html.htr-active[data-htr-view="list"][data-htr-analytics="compact"] [data-test-id="data-well-collapsible"] {
  height: 96px !important;
  min-height: 96px !important;
  max-height: 96px !important;
  overflow: hidden !important;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="report-card-v2"] {
  min-height: 74px !important;
  max-height: 74px !important;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="report-card-v2--card-wrapper"] {
  min-height: 72px !important;
  padding: 11px 16px !important;
}

html.htr-active[data-htr-analytics="hidden"] [data-test-id="data-well"] {
  display: none !important;
}

html.htr-active[data-htr-view="list"][data-htr-analytics="hidden"] .htr-list-datawell {
  display: none !important;
}

html.htr-active [data-test-id="report-card-v2"] {
  background: var(--htr-surface) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

html.htr-active [data-test-id="report-card-v2"]:not(:last-child) {
  border-right: 1px solid var(--htr-border) !important;
}

html.htr-active [data-test-id="report-card-v2"] :is(
  [class*="metric-label"],
  [data-test-id*="label"]
) {
  color: var(--htr-muted) !important;
  font-size: 11.5px !important;
  font-weight: 550 !important;
}

html.htr-active [data-test-id="report-card-v2"] :is(
  [class*="metric-value"],
  h2,
  h3
) {
  color: var(--htr-text-strong) !important;
  font-size: 21px !important;
  font-weight: 720 !important;
  letter-spacing: -0.025em !important;
}

html.htr-active [data-test-id="framework-data-table-container"] {
  min-height: 0 !important;
  padding: 0 var(--htr-content-pad) !important;
  background: var(--htr-surface) !important;
  border: 0 !important;
}

html.htr-active [data-test-id="fdt-scroll-window"] {
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-bottom: 0 !important;
  border-radius: var(--htr-radius-sm) var(--htr-radius-sm) 0 0 !important;
  scrollbar-color: var(--htr-border-strong) transparent;
  scrollbar-width: thin;
}

html.htr-active [data-test-id="framework-data-table"] {
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
  table-layout: fixed !important;
  background: var(--htr-surface) !important;
  color: var(--htr-text) !important;
  font-size: 12.5px !important;
}

html.htr-active [data-test-id="framework-data-table"] thead {
  position: sticky !important;
  top: 0 !important;
  z-index: 4 !important;
}

html.htr-active [data-test-id="framework-data-table"] th {
  height: 33px !important;
  min-height: 33px !important;
  padding: 0 10px !important;
  background: var(--htr-surface-raised) !important;
  border-bottom: 1px solid var(--htr-border) !important;
  color: var(--htr-muted) !important;
  font-size: 11px !important;
  font-weight: 680 !important;
  letter-spacing: 0.012em !important;
  text-transform: none !important;
}

html.htr-active [data-test-id="framework-data-table"] tbody tr {
  height: var(--htr-row-height) !important;
  background: var(--htr-surface) !important;
  transition: background-color var(--htr-speed) ease,
    box-shadow var(--htr-speed) ease !important;
}

html.htr-active [data-test-id="framework-data-table"] tbody tr:hover {
  background: var(--htr-surface-hover) !important;
  box-shadow: inset 3px 0 var(--htr-accent) !important;
}

html.htr-active [data-test-id="framework-data-table"] tbody tr[aria-selected="true"],
html.htr-active [data-test-id="framework-data-table"] tbody tr:has(input:checked) {
  background: var(--htr-surface-selected) !important;
}

html.htr-active [data-test-id="framework-data-table"] td {
  height: var(--htr-row-height) !important;
  min-height: var(--htr-row-height) !important;
  padding: 0 10px !important;
  background: transparent !important;
  border-bottom: 1px solid color-mix(in srgb, var(--htr-border) 78%, transparent) !important;
  color: var(--htr-text) !important;
  line-height: 1.25 !important;
}

html.htr-active [data-test-id="framework-data-table"] td > * {
  max-height: calc(var(--htr-row-height) - 4px) !important;
}

html.htr-active [data-test-id="framework-data-table-editable-cell"] {
  min-height: 26px !important;
  padding-block: 0 !important;
}

html.htr-active [data-test-id^="label-cell-formatted-property-"] {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

html.htr-active [data-test-id^="cell-0-5-subject-"] :is(a, button) {
  color: var(--htr-link) !important;
  font-weight: 680 !important;
}

html.htr-active [data-htr-tone] {
  display: inline-flex !important;
  align-items: center !important;
  width: auto !important;
  min-height: 22px !important;
  padding: 0 7px !important;
  border: 1px solid var(--htr-border) !important;
  border-radius: var(--htr-radius-xs) !important;
  font-size: 11px !important;
  font-weight: 650 !important;
  line-height: 20px !important;
  white-space: nowrap !important;
}

html.htr-active [data-htr-tone="waiting-contact"],
html.htr-active [data-htr-tone="medium"] {
  background: var(--htr-warning-soft) !important;
  border-color: color-mix(in srgb, var(--htr-warning) 42%, var(--htr-border)) !important;
  color: var(--htr-warning) !important;
}

html.htr-active [data-htr-tone="waiting-us"] {
  background: var(--htr-info-soft) !important;
  border-color: color-mix(in srgb, var(--htr-info) 42%, var(--htr-border)) !important;
  color: var(--htr-info) !important;
}

html.htr-active [data-htr-tone="closed"],
html.htr-active [data-htr-tone="low"] {
  background: var(--htr-success-soft) !important;
  border-color: color-mix(in srgb, var(--htr-success) 42%, var(--htr-border)) !important;
  color: var(--htr-success) !important;
}

html.htr-active [data-htr-tone="open"],
html.htr-active [data-htr-tone="high"] {
  background: var(--htr-danger-soft) !important;
  border-color: color-mix(in srgb, var(--htr-danger) 42%, var(--htr-border)) !important;
  color: var(--htr-danger) !important;
}

html.htr-active [data-test-id="framework-data-table"] input[type="checkbox"] {
  width: 16px !important;
  height: 16px !important;
  border-radius: var(--htr-radius-xs) !important;
  accent-color: var(--htr-accent-strong) !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="waiting-contact"] {
  box-shadow: inset 3px 0 var(--htr-warning) !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="waiting-us"] {
  box-shadow: inset 3px 0 var(--htr-info) !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="closed"] {
  box-shadow: inset 3px 0 var(--htr-success) !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="open"] {
  box-shadow: inset 3px 0 var(--htr-danger) !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="waiting-contact"] :is(
  [data-test-id^="cell-0-5-hs_pipeline_stage-"],
  [data-htr-semantic-cell="status"]
) {
  color: var(--htr-warning) !important;
  font-weight: 650 !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="waiting-us"] :is(
  [data-test-id^="cell-0-5-hs_pipeline_stage-"],
  [data-htr-semantic-cell="status"]
) {
  color: var(--htr-info) !important;
  font-weight: 650 !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="closed"] :is(
  [data-test-id^="cell-0-5-hs_pipeline_stage-"],
  [data-htr-semantic-cell="status"]
) {
  color: var(--htr-success) !important;
  font-weight: 650 !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-status="open"] :is(
  [data-test-id^="cell-0-5-hs_pipeline_stage-"],
  [data-htr-semantic-cell="status"]
) {
  color: var(--htr-danger) !important;
  font-weight: 650 !important;
}

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-priority="high"] [data-test-id^="cell-0-5-hs_ticket_priority-"] {
  color: var(--htr-danger) !important;
  font-weight: 700 !important;
}

html.htr-active [data-test-id="table-paginator"] {
  min-height: 40px !important;
  padding: 4px 10px !important;
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-top: 0 !important;
  border-radius: 0 0 var(--htr-radius-sm) var(--htr-radius-sm) !important;
  color: var(--htr-muted) !important;
}

html.htr-active [data-test-id="table-paginator"] button,
html.htr-active [data-test-id="viz-sync-footer"] button {
  background: var(--htr-surface) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="table-paginator"] button:hover,
html.htr-active [data-test-id="viz-sync-footer"] button:hover {
  background: var(--htr-surface-hover) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-accent) !important;
}

html.htr-active [data-test-id="viz-sync-footer"] {
  min-height: 46px !important;
  padding: 6px var(--htr-content-pad) !important;
  background: var(--htr-surface) !important;
  border-top: 1px solid var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="IndexPageInlineSidebar"] {
  background: var(--htr-surface) !important;
  border-left: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] #crm {
  gap: 0 !important;
  min-width: 0 !important;
  background: var(--htr-canvas) !important;
  border-top: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] main,
html.htr-active[data-htr-view="record"] .record-shell {
  padding: 0 !important;
}

html.htr-active[data-htr-view="record"] #record-page-left-sidebar {
  flex: 0 0 var(--htr-left-width) !important;
  width: var(--htr-left-width) !important;
  min-width: var(--htr-left-width) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="records-right-sidebar"] {
  flex: 0 0 var(--htr-right-width) !important;
  width: var(--htr-right-width) !important;
  min-width: var(--htr-right-width) !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id="left-sidebar"],
  [data-test-id="right-sidebar"]
) {
  width: 100% !important;
  min-width: 0 !important;
  background: var(--htr-surface-subtle) !important;
  color: var(--htr-text) !important;
  scrollbar-color: var(--htr-border-strong) transparent;
  scrollbar-width: thin;
}

html.htr-active[data-htr-view="record"] [data-test-id="left-sidebar"] {
  border-right: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="right-sidebar"] {
  border-left: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] {
  width: auto !important;
  margin: 0 !important;
  background: transparent !important;
  border-radius: 0 !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] > div {
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  border-bottom: 1px solid var(--htr-border) !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="CardWrapper__Outer-"] {
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  border-bottom: 1px solid var(--htr-border) !important;
  border-radius: 0 !important;
  color: var(--htr-text) !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="UITile__Tile-"] {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="Overhang__StyledOverhang-"] {
  background: var(--htr-surface-subtle) !important;
  background-image: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] button {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] a {
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="FormLabel__StyledLabel-"] {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="UITile__Tile-"] :is(p, span) {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="UITile__Tile-"] :is(a, a span) {
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] :is(
  [data-test-id="positive-feedback-button"],
  [data-test-id="negative-feedback-button"],
  [data-test-id="copy-button"]
) {
  background: var(--htr-surface-raised) !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id="chat-with-copilot-button"],
  [data-test-id="toggle-sidebar-collapse"]
) {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="record-highlight-content"] {
  padding: 20px !important;
  gap: 9px !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id="mini-highlight-container"],
  [data-test-id="highlight-avatar-icon"]
) {
  display: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="record-highlight-main-content"] {
  gap: 7px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="highlight-property-display-"] {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="highlight-property-item-"] > div:first-child {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="highlight-property-display-hs_pipeline_stage"] {
  display: inline-flex !important;
  align-items: center !important;
  width: auto !important;
  min-height: 22px !important;
  padding: 0 7px !important;
  background: var(--htr-surface-raised) !important;
  border: 1px solid var(--htr-border-strong) !important;
  border-radius: var(--htr-radius-xs) !important;
  color: var(--htr-info) !important;
  font-size: 11px !important;
  font-weight: 650 !important;
  line-height: 20px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="highlight-record-label"] {
  color: var(--htr-text-strong) !important;
  font-size: 19px !important;
  font-weight: 720 !important;
  line-height: 1.3 !important;
  letter-spacing: -0.022em !important;
}

html.htr-active[data-htr-view="record"] button:has([data-test-id^="activity-button-icon-"]) {
  width: 32px !important;
  min-width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  background: var(--htr-surface-subtle) !important;
  border: 1px solid var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] button:has([data-test-id^="activity-button-icon-"]):hover {
  background: var(--htr-accent-soft) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-content"] {
  padding: 0 !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-PROPERTIES"] [data-test-id="crm-card-content"] {
  padding: 8px 20px 20px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] > div > header {
  padding: 16px 20px 8px !important;
  background: transparent !important;
  color: var(--htr-text-strong) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-content"] :is(
  .property,
  [data-test-id^="property-row-"]
) {
  display: grid !important;
  grid-template-columns: minmax(104px, 38%) minmax(0, 1fr) !important;
  align-items: start !important;
  gap: 12px !important;
  padding-block: 4px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-content"] :is(label, [class*="FormLabel__StyledLabel-"]) {
  color: var(--htr-muted) !important;
  font-size: 11.5px !important;
  line-height: 1.45 !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-actions"] {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="tab-1-content"] {
  min-width: 0 !important;
  background: var(--htr-canvas) !important;
  border-inline: 0 !important;
}

html.htr-active[data-htr-view="record"] :is(
  .activity-toolbar,
  [data-test-id="timeline-toolbar"],
  [data-test-id="timeline-filters"]
) {
  min-height: 64px !important;
  padding: 10px 20px !important;
  background: var(--htr-canvas) !important;
  border-bottom: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] [data-tab-link="true"] {
  min-height: 52px !important;
  background: var(--htr-canvas) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] [data-tab-link="true"][data-tab-selected="true"] {
  background: var(--htr-canvas) !important;
  color: var(--htr-text-strong) !important;
  box-shadow: inset 0 -2px var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] button {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] button:hover {
  background: var(--htr-surface-hover) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-text-strong) !important;
}

html.htr-active[data-htr-view="record"] [role="tablist"] {
  min-height: 52px !important;
  background: var(--htr-canvas) !important;
  border-color: var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] [role="tab"] {
  min-height: 51px !important;
  padding: 0 20px !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [role="tab"][aria-selected="true"] {
  color: var(--htr-text-strong) !important;
  background: transparent !important;
  box-shadow: inset 0 -2px var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id^="timeline-tab-filter-"],
  [data-test-id="timeline-tab-filter-activity"]
) {
  min-height: 32px !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] button[data-test-id^="timeline-tab-filter-"] {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-events-viz-timeline"] {
  padding: 16px 20px 32px !important;
  background: var(--htr-canvas) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-events-viz-timeline"] button {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-selenium-test="timeline-filter-container"] button {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
  opacity: 1 !important;
}

html.htr-active[data-htr-view="record"] [data-selenium-test="timeline-filter-container"] button * {
  background: transparent !important;
  color: inherit !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] :has(> [data-selenium-test="timeline-filter-container"]) {
  background: var(--htr-canvas) !important;
  color: var(--htr-text) !important;
  opacity: 1 !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="pinned-activity-section"] {
  margin-bottom: 12px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] {
  margin-bottom: 10px !important;
  padding: 13px 15px !important;
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-radius: var(--htr-radius-sm) !important;
  color: var(--htr-text) !important;
  box-shadow: none !important;
  line-height: 1.5 !important;
  transition: background-color var(--htr-speed) ease,
    border-color var(--htr-speed) ease,
    transform var(--htr-speed) ease !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"]:hover {
  border-color: color-mix(in srgb, var(--htr-accent) 55%, var(--htr-border)) !important;
  background: var(--htr-surface-raised) !important;
  transform: translateY(-1px);
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] :is(p, span, div) {
  color: inherit !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] :is(a, a span) {
  color: var(--htr-link) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-events-viz-timeline"] [class*="SanitizedText__StyledText-"] :is(
  div,
  p,
  span,
  table,
  tbody,
  tr,
  td,
  font
) {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-events-viz-timeline"] [class*="SanitizedText__StyledText-"] :is(a, a *) {
  color: var(--htr-link) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-note-event"] {
  background: transparent !important;
  border-color: transparent !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] [class*="Overhang__StyledOverhang-"] {
  background: var(--htr-surface) !important;
  background-image: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-note-event"] [class*="Overhang__StyledOverhang-"] {
  background: var(--htr-surface) !important;
  background-image: none !important;
}

html.htr-active[data-htr-view="record"] [class*="SkeletonText-"] {
  background: var(--htr-surface-raised) !important;
  background-image: none !important;
  animation: htr-pulse 1.4s ease-in-out infinite alternate !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="event-timestamp"] {
  color: var(--htr-muted) !important;
  font-size: 11.5px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-event-container-loading-state"] {
  background: var(--htr-surface-raised) !important;
  border-radius: var(--htr-radius-sm) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="copilot-preview-v2-header"] {
  color: var(--htr-text-strong) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="preview-summary"] {
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  color: var(--htr-text) !important;
  line-height: 1.58 !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-AI_OBJECT_SUMMARY"] [data-test-id="crm-card-content"] {
  padding: 0 20px 20px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-AI_OBJECT_SUMMARY"] :is(
  [class*="UITile__Tile-"],
  [class*="TileSection__StyledTileSection-"],
  [class*="ExpandableText__StyledContainer-"],
  [class*="ExpandableText__StyledTextWrapper-"]
) {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="preview-summary"] :is(p, span) {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="preview-summary"] :is(a, a span) {
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="associated-objects-card-content-"] {
  gap: 8px !important;
  padding: 0 20px 20px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="associated-objects-card-content-"] > * {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  border-radius: var(--htr-radius-sm) !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id^="chicklet-"],
  [data-test-id^="chiclet-"]
) {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  border-radius: var(--htr-radius-sm) !important;
  color: var(--htr-text) !important;
  box-shadow: none !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id^="chicklet-"],
  [data-test-id^="chiclet-"]
) :is(div, span, p) {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] :is(
  [data-test-id^="chicklet-"],
  [data-test-id^="chiclet-"]
) :is(a, a span) {
  color: var(--htr-link) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="associated-objects-card-content-"] > *:hover {
  background: var(--htr-surface-hover) !important;
  border-color: var(--htr-border-strong) !important;
}

html.htr-active [data-loading="true"],
html.htr-active [aria-busy="true"] {
  color: var(--htr-muted) !important;
}

html.htr-active ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

html.htr-active ::-webkit-scrollbar-track {
  background: transparent;
}

html.htr-active ::-webkit-scrollbar-thumb {
  background: var(--htr-border-strong);
  border: 2px solid var(--htr-surface);
  border-radius: var(--htr-radius-sm);
}

html.htr-active ::-webkit-scrollbar-thumb:hover {
  background: var(--htr-muted);
}

@keyframes htr-pulse {
  from {
    opacity: 0.58;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 1320px) {
  html.htr-active {
    --htr-nav-width: 64px;
    --htr-left-width: 304px;
    --htr-right-width: 288px;
  }

  html.htr-active [data-test-id="hs-vertical-nav"] {
    width: 64px !important;
    min-width: 64px !important;
  }
}

@media (forced-colors: active) {
  html.htr-active :is(a, button, input, textarea, select, [role="button"], [tabindex]):focus-visible {
    outline: 2px solid Highlight !important;
  }

  html.htr-active [data-htr-tone] {
    border: 1px solid CanvasText !important;
    forced-color-adjust: auto;
  }

  html.htr-active [data-test-id="hs-vertical-nav"] [aria-current="page"],
  html.htr-active [data-test-id="hs-vertical-nav"] [aria-selected="true"] {
    box-shadow: inset 3px 0 Highlight !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  html.htr-active *,
  html.htr-active *::before,
  html.htr-active *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;

  const PANEL_CSS = `
:host {
  --panel-bg: #0f1d2c;
  --panel-subtle: #111f2f;
  --panel-raised: #15263a;
  --panel-hover: #1a3046;
  --panel-text: #f8fbff;
  --panel-muted: #a8b6c5;
  --panel-border: #3b536b;
  --panel-accent: #40d7c6;
  --panel-accent-soft: #12353a;
  --panel-focus: #65bff7;
  position: fixed;
  right: 16px;
  bottom: 10px;
  z-index: 2147483000;
  display: block;
  width: 0;
  height: 0;
  pointer-events: none;
  font: 13px/1.4 Inter, "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
}

:host-context(html[data-htr-view="list"]) {
  right: 18px;
  bottom: 56px;
}

:host-context(html[data-htr-view="record"]) {
  right: calc(var(--htr-right-width, 324px) + 16px);
}

:host-context(html[data-htr-theme="light"]) {
  --panel-bg: #ffffff;
  --panel-subtle: #fbfcfe;
  --panel-raised: #f6f8fb;
  --panel-hover: #edf5f6;
  --panel-text: #0d1b2d;
  --panel-muted: #586a7f;
  --panel-border: #becad7;
  --panel-accent: #087b76;
  --panel-accent-soft: #dcf3ef;
  --panel-focus: #006eb8;
}

* {
  box-sizing: border-box;
}

button {
  font: inherit;
}

.htr-shell {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 7px;
  pointer-events: none;
}

.htr-trigger,
.htr-panel,
.htr-toast {
  pointer-events: auto;
}

.htr-trigger {
  min-width: 72px;
  height: 34px;
  padding: 0 13px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 8px 22px rgb(0 0 0 / 22%);
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.01em;
  transition: background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.htr-trigger:hover,
.htr-trigger[aria-expanded="true"] {
  border-color: var(--panel-accent);
  background: var(--panel-accent-soft);
  color: var(--panel-accent);
}

.htr-trigger:active {
  transform: translateY(1px);
}

.htr-panel {
  width: 320px;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 24px 64px rgb(0 0 0 / 36%);
}

.htr-panel[hidden] {
  display: none;
}

.htr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--panel-border);
}

.htr-title-wrap {
  display: grid;
  gap: 3px;
}

.htr-title {
  color: var(--panel-text);
  font-size: 16px;
  font-weight: 720;
  letter-spacing: -0.015em;
}

.htr-subtitle,
.htr-note {
  color: var(--panel-muted);
  font-size: 11.5px;
}

.htr-close,
.htr-reset {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: transparent;
  color: var(--panel-muted);
  cursor: pointer;
}

.htr-close:hover,
.htr-reset:hover {
  background: var(--panel-hover);
  color: var(--panel-text);
}

.htr-group {
  min-width: 0;
  margin: 0 0 13px;
  padding: 0;
  border: 0;
}

.htr-legend {
  margin-bottom: 7px;
  padding: 0;
  color: var(--panel-muted);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.htr-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.htr-options[data-columns="3"] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.htr-option {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: var(--panel-raised);
  color: var(--panel-muted);
  cursor: pointer;
  font-size: 11.5px;
  transition: background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.htr-option:hover {
  background: var(--panel-hover);
  color: var(--panel-text);
}

.htr-option[data-selected="true"] {
  border-color: var(--panel-accent);
  background: var(--panel-accent-soft);
  color: var(--panel-accent);
  font-weight: 700;
  box-shadow: inset 3px 0 var(--panel-accent);
}

.htr-footer {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px;
  margin-top: 3px;
  padding-top: 12px;
  border-top: 1px solid var(--panel-border);
}

.htr-note {
  line-height: 1.25;
}

.htr-toast {
  min-width: 210px;
  padding: 10px 12px;
  border: 1px solid var(--panel-border);
  border-left: 3px solid var(--panel-accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 12px 30px rgb(0 0 0 / 28%);
}

.htr-toast[hidden] {
  display: none;
}

button:focus-visible {
  outline: 2px solid var(--panel-focus);
  outline-offset: 2px;
}

@media (forced-colors: active) {
  button:focus-visible {
    outline: 2px solid Highlight;
  }

  .htr-trigger,
  .htr-panel,
  .htr-option,
  .htr-close,
  .htr-reset {
    border: 1px solid CanvasText;
    forced-color-adjust: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}

@media (max-width: 760px) {
  :host-context(html[data-htr-view="list"]) {
    right: 18px;
    bottom: 56px;
  }

  :host-context(html[data-htr-view="record"]) {
    right: 18px;
    bottom: 56px;
  }
}
`;

  activateRoot();
  addThemeStyle();
  watchAutomaticTheme();
  registerMenus();
  startWhenReady();
})();
