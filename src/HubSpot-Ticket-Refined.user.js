// ==UserScript==
// @name         HubSpot Ticket Refined
// @namespace    https://github.com/SysAdminDoc/HubSpot-Ticket-Refined
// @version      0.1.0
// @description  A compact premium theme for HubSpot ticket lists and ticket records.
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

  const VERSION = "0.1.0";
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
        panelApi?.toast("Preference could not be saved");
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
    panelApi?.toast("Refined defaults restored");
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
      } else {
        delete row.dataset.htrPriority;
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
    const reset = element("button", "htr-reset", "Reset style");
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
  --htr-font: "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
  --htr-row-height: 34px;
  --htr-nav-width: 204px;
  --htr-left-width: 356px;
  --htr-right-width: 300px;
  --htr-radius-xs: 4px;
  --htr-radius-sm: 6px;
  --htr-radius-md: 8px;
  --htr-radius-lg: 10px;
  --htr-speed: 160ms;
  --global-nav-vertical-nav-width: var(--htr-nav-width) !important;
  color-scheme: dark;
  font-family: var(--htr-font) !important;
}

html.htr-active[data-htr-theme="dark"] {
  --htr-canvas: #0b1018;
  --htr-chrome: #080c12;
  --htr-sidebar: #0e1520;
  --htr-surface: #111a27;
  --htr-surface-raised: #172232;
  --htr-surface-hover: #1d2a3c;
  --htr-surface-selected: #16343a;
  --htr-text: #edf3f8;
  --htr-text-strong: #ffffff;
  --htr-muted: #9cabbc;
  --htr-faint: #748398;
  --htr-border: #2b394c;
  --htr-border-strong: #40516a;
  --htr-accent: #5eead4;
  --htr-accent-strong: #2dd4bf;
  --htr-accent-soft: #143b3c;
  --htr-accent-ink: #062d2a;
  --htr-focus: #7dd3fc;
  --htr-success: #67d7a5;
  --htr-warning: #f2c879;
  --htr-danger: #f4a3b7;
  --htr-info: #82bdf7;
  --htr-shadow: 0 14px 36px rgb(0 0 0 / 28%);
  --htr-shadow-soft: 0 4px 14px rgb(0 0 0 / 20%);
  color-scheme: dark;
}

html.htr-active[data-htr-theme="light"] {
  --htr-canvas: #eef2f6;
  --htr-chrome: #111827;
  --htr-sidebar: #17212f;
  --htr-surface: #ffffff;
  --htr-surface-raised: #f7f9fc;
  --htr-surface-hover: #eef4f7;
  --htr-surface-selected: #dff5f1;
  --htr-text: #1f2937;
  --htr-text-strong: #0f172a;
  --htr-muted: #5f6c7b;
  --htr-faint: #7b8795;
  --htr-border: #d5dde7;
  --htr-border-strong: #b9c5d2;
  --htr-accent: #0f766e;
  --htr-accent-strong: #0d9488;
  --htr-accent-soft: #d9f3ee;
  --htr-accent-ink: #f0fdfa;
  --htr-focus: #0369a1;
  --htr-success: #18815d;
  --htr-warning: #9a6100;
  --htr-danger: #b4234d;
  --htr-info: #1e64b7;
  --htr-shadow: 0 16px 38px rgb(15 23 42 / 13%);
  --htr-shadow-soft: 0 3px 12px rgb(15 23 42 / 9%);
  color-scheme: light;
}

html.htr-active[data-htr-density="comfortable"] {
  --htr-row-height: 42px;
  --htr-left-width: 372px;
  --htr-right-width: 316px;
}

html.htr-active[data-htr-navigation="standard"] {
  --htr-nav-width: 236px;
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
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

html.htr-active ::selection {
  background: var(--htr-accent-soft);
  color: var(--htr-text-strong);
}

html.htr-active :is(a, [role="link"]) {
  color: var(--htr-accent) !important;
  text-underline-offset: 2px;
}

html.htr-active :is(h1, h2, h3, h4, strong) {
  color: var(--htr-text-strong) !important;
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
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
  box-shadow: var(--htr-shadow) !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] {
  background: var(--htr-chrome) !important;
  border-bottom: 1px solid var(--htr-border) !important;
  color: #f8fafc !important;
  box-shadow: 0 1px 0 rgb(255 255 255 / 4%) !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] :is(a, button, [role="button"]) {
  color: #f8fafc !important;
}

html.htr-active [data-test-id="hs-global-toolbar"] :is(strong, span) {
  color: #f8fafc !important;
}

html.htr-active #hs-global-toolbar-icons {
  background: transparent !important;
}

html.htr-active [data-test-id="global-search-input-react"] {
  background: rgb(255 255 255 / 7%) !important;
  border-color: rgb(255 255 255 / 28%) !important;
  color: #ffffff !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] {
  width: var(--htr-nav-width) !important;
  min-width: var(--htr-nav-width) !important;
  background: var(--htr-sidebar) !important;
  border-right: 1px solid var(--htr-border) !important;
  color: #e7edf5 !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] .primary-nav-menu {
  width: 100% !important;
  min-width: 0 !important;
  background: transparent !important;
}

html.htr-active [data-test-id="hs-vertical-nav-content"] > button {
  background: var(--htr-sidebar) !important;
  color: #d8e0ea !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] :is(a, button, [role="button"]) {
  color: #d8e0ea !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] :is(a, button, [role="button"]):hover {
  background: rgb(255 255 255 / 7%) !important;
  color: #ffffff !important;
}

html.htr-active [data-test-id="hs-vertical-nav"] [aria-current="page"],
html.htr-active [data-test-id="hs-vertical-nav"] [aria-selected="true"],
html.htr-active [data-test-id="hs-vertical-nav"] [data-nav-item-id].isHighlighted > button {
  background: rgb(94 234 212 / 14%) !important;
  color: #a7f3e8 !important;
  box-shadow: inset 3px 0 #5eead4 !important;
}

html.htr-active[data-htr-view="list"] main {
  padding: 10px 12px 12px !important;
}

html.htr-active[data-htr-view="list"] main > div {
  border-radius: var(--htr-radius-lg) !important;
}

html.htr-active[data-htr-view="list"] main > :is(div, section),
html.htr-active[data-htr-view="list"] main header[role="presentation"],
html.htr-active[data-htr-view="list"] main [role="banner"] {
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="view-tabs-container-lite"] {
  min-height: 40px !important;
  padding-inline: 12px !important;
  border-bottom: 1px solid var(--htr-border) !important;
  background: var(--htr-surface) !important;
}

html.htr-active [data-test-id="view-tab-menu"] {
  min-height: 34px !important;
}

html.htr-active [data-test-id="crm-lite-toolbar-wrapper"] {
  min-height: 66px !important;
  padding: 8px 12px !important;
  background: var(--htr-surface) !important;
  border-bottom: 1px solid var(--htr-border) !important;
}

html.htr-active [data-test-id="toolbar"] {
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
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
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
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="compact-toolbar-search-input"] {
  height: 32px !important;
}

html.htr-active [data-test-id="quick-filters"] {
  gap: 6px !important;
  min-height: 28px !important;
}

html.htr-active [data-test-id="data-well"] {
  background: var(--htr-surface) !important;
  border-bottom: 1px solid var(--htr-border) !important;
  overflow: hidden !important;
  transition: max-height 180ms ease, opacity 180ms ease !important;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="data-well"] {
  max-height: 88px !important;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="report-card-v2"] {
  min-height: 72px !important;
  max-height: 72px !important;
}

html.htr-active[data-htr-analytics="compact"] [data-test-id="report-card-v2--card-wrapper"] {
  min-height: 70px !important;
  padding: 8px 10px !important;
}

html.htr-active[data-htr-analytics="hidden"] [data-test-id="data-well"] {
  display: none !important;
}

html.htr-active [data-test-id="report-card-v2"] {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  border-radius: var(--htr-radius-md) !important;
  box-shadow: none !important;
}

html.htr-active [data-test-id="framework-data-table-container"] {
  min-height: 0 !important;
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
}

html.htr-active [data-test-id="fdt-scroll-window"] {
  background: var(--htr-surface) !important;
  scrollbar-color: var(--htr-border-strong) transparent;
  scrollbar-width: thin;
}

html.htr-active [data-test-id="framework-data-table"] {
  width: 100% !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
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
  height: 31px !important;
  min-height: 31px !important;
  padding: 0 10px !important;
  background: var(--htr-surface-raised) !important;
  border-bottom: 1px solid var(--htr-border-strong) !important;
  color: var(--htr-muted) !important;
  font-size: 11.5px !important;
  font-weight: 650 !important;
  letter-spacing: 0.01em !important;
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
  border-bottom: 1px solid var(--htr-border) !important;
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
  color: var(--htr-accent) !important;
  font-weight: 650 !important;
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

html.htr-active [data-test-id="framework-data-table"] tr[data-htr-priority="high"] [data-test-id^="cell-0-5-hs_ticket_priority-"] {
  color: var(--htr-danger) !important;
  font-weight: 700 !important;
}

html.htr-active [data-test-id="table-paginator"] {
  min-height: 38px !important;
  padding: 4px 10px !important;
  background: var(--htr-surface-raised) !important;
  border-top: 1px solid var(--htr-border) !important;
  color: var(--htr-muted) !important;
}

html.htr-active [data-test-id="table-paginator"] button,
html.htr-active [data-test-id="viz-sync-footer"] button {
  background: var(--htr-surface) !important;
  border-color: var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="viz-sync-footer"] {
  min-height: 44px !important;
  padding: 6px 12px !important;
  background: var(--htr-surface) !important;
  border-top: 1px solid var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active [data-test-id="IndexPageInlineSidebar"] {
  background: var(--htr-surface) !important;
  border-left: 1px solid var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] #crm {
  gap: 10px !important;
  min-width: 0 !important;
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
  background: var(--htr-canvas) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] {
  width: auto !important;
  margin-inline: 10px !important;
  margin-bottom: 10px !important;
  background: var(--htr-surface) !important;
  border-radius: var(--htr-radius-md) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] > div {
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-radius: var(--htr-radius-md) !important;
  box-shadow: var(--htr-shadow-soft) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="CardWrapper__Outer-"] {
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="UITile__Tile-"] {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="card-wrapper-"] [class*="Overhang__StyledOverhang-"] {
  background-image: linear-gradient(transparent, var(--htr-surface)) !important;
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
  padding: 12px 14px 11px !important;
  gap: 8px !important;
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

html.htr-active[data-htr-view="record"] [data-test-id="highlight-record-label"] {
  color: var(--htr-text-strong) !important;
  font-size: 17px !important;
  font-weight: 650 !important;
  line-height: 1.28 !important;
  letter-spacing: -0.01em !important;
}

html.htr-active[data-htr-view="record"] button:has([data-test-id^="activity-button-icon-"]) {
  width: 34px !important;
  min-width: 34px !important;
  height: 34px !important;
  padding: 0 !important;
  background: var(--htr-surface-raised) !important;
  border: 1px solid var(--htr-border-strong) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] button:has([data-test-id^="activity-button-icon-"]):hover {
  background: var(--htr-accent-soft) !important;
  border-color: var(--htr-accent) !important;
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-content"] {
  padding: 11px 14px 13px !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="crm-card-actions"] {
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="tab-1-content"] {
  min-width: 0 !important;
  background: var(--htr-canvas) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] [data-tab-link="true"] {
  min-height: 42px !important;
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="middle-pane"] [data-tab-link="true"][data-tab-selected="true"] {
  background: var(--htr-surface-raised) !important;
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
  min-height: 43px !important;
  background: var(--htr-surface) !important;
  border-color: var(--htr-border) !important;
}

html.htr-active[data-htr-view="record"] [role="tab"] {
  min-height: 42px !important;
  padding: 0 14px !important;
  color: var(--htr-muted) !important;
}

html.htr-active[data-htr-view="record"] [role="tab"][aria-selected="true"] {
  color: var(--htr-text-strong) !important;
  background: var(--htr-surface-raised) !important;
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
  padding: 10px 8px 24px !important;
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
  background: var(--htr-surface) !important;
  color: var(--htr-text) !important;
  opacity: 1 !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="pinned-activity-section"] {
  margin-bottom: 10px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] {
  margin-bottom: 8px !important;
  padding: 11px 13px !important;
  background: var(--htr-surface) !important;
  border: 1px solid var(--htr-border) !important;
  border-radius: var(--htr-radius-md) !important;
  color: var(--htr-text) !important;
  box-shadow: var(--htr-shadow-soft) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"]:hover {
  border-color: var(--htr-border-strong) !important;
  background: var(--htr-surface-raised) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-note-event"] {
  background: color-mix(in srgb, var(--htr-warning) 12%, var(--htr-surface)) !important;
  border-color: color-mix(in srgb, var(--htr-warning) 45%, var(--htr-border)) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-preview-event"] [class*="Overhang__StyledOverhang-"] {
  background-image: linear-gradient(transparent, var(--htr-surface)) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="timeline-note-event"] [class*="Overhang__StyledOverhang-"] {
  background-image: linear-gradient(
    transparent,
    color-mix(in srgb, var(--htr-warning) 12%, var(--htr-surface))
  ) !important;
}

html.htr-active[data-htr-view="record"] [class*="SkeletonText-"] {
  background-image: linear-gradient(
    90deg,
    var(--htr-surface-raised),
    var(--htr-surface-hover) 20%,
    var(--htr-surface-raised) 40%
  ) !important;
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
  padding: 12px !important;
  background: var(--htr-surface-raised) !important;
  border: 1px solid var(--htr-accent) !important;
  border-radius: var(--htr-radius-md) !important;
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="preview-summary"] :is(p, span) {
  color: var(--htr-text) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id="preview-summary"] :is(a, a span) {
  color: var(--htr-accent) !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="associated-objects-card-content-"] {
  gap: 8px !important;
}

html.htr-active[data-htr-view="record"] [data-test-id^="associated-objects-card-content-"] > * {
  background: var(--htr-surface-raised) !important;
  border-color: var(--htr-border) !important;
  border-radius: var(--htr-radius-sm) !important;
}

html.htr-active [data-loading="true"],
html.htr-active [aria-busy="true"] {
  color: var(--htr-muted) !important;
}

html.htr-active ::-webkit-scrollbar {
  width: 9px;
  height: 9px;
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
  --panel-bg: #111a27;
  --panel-raised: #172232;
  --panel-hover: #1d2a3c;
  --panel-text: #edf3f8;
  --panel-muted: #9cabbc;
  --panel-border: #34445a;
  --panel-accent: #5eead4;
  --panel-focus: #7dd3fc;
  position: fixed;
  right: 18px;
  bottom: 12px;
  z-index: 2147483000;
  display: block;
  width: 0;
  height: 0;
  pointer-events: none;
  font: 13px/1.35 "Segoe UI Variable Text", "Segoe UI", Arial, sans-serif;
}

:host-context(html[data-htr-view="list"]) {
  right: 300px;
}

:host-context(html[data-htr-theme="light"]) {
  --panel-bg: #ffffff;
  --panel-raised: #f3f6fa;
  --panel-hover: #e8f0f4;
  --panel-text: #172033;
  --panel-muted: #657184;
  --panel-border: #cbd5e1;
  --panel-accent: #0f766e;
  --panel-focus: #0369a1;
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
  gap: 8px;
  pointer-events: none;
}

.htr-trigger,
.htr-panel,
.htr-toast {
  pointer-events: auto;
}

.htr-trigger {
  min-width: 68px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 5px 18px rgb(0 0 0 / 20%);
  cursor: pointer;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.htr-trigger:hover,
.htr-trigger[aria-expanded="true"] {
  border-color: var(--panel-accent);
  background: var(--panel-hover);
  color: var(--panel-accent);
}

.htr-panel {
  width: 304px;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 20px 52px rgb(0 0 0 / 32%);
}

.htr-panel[hidden] {
  display: none;
}

.htr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 13px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--panel-border);
}

.htr-title-wrap {
  display: grid;
  gap: 2px;
}

.htr-title {
  color: var(--panel-text);
  font-size: 15px;
  font-weight: 700;
}

.htr-subtitle,
.htr-note {
  color: var(--panel-muted);
  font-size: 11px;
}

.htr-close,
.htr-reset {
  min-height: 28px;
  padding: 0 9px;
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
  margin: 0 0 12px;
  padding: 0;
  border: 0;
}

.htr-legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--panel-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.025em;
  text-transform: uppercase;
}

.htr-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}

.htr-options[data-columns="3"] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.htr-option {
  min-width: 0;
  min-height: 32px;
  padding: 5px 7px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: var(--panel-raised);
  color: var(--panel-muted);
  cursor: pointer;
  font-size: 11.5px;
}

.htr-option:hover {
  background: var(--panel-hover);
  color: var(--panel-text);
}

.htr-option[data-selected="true"] {
  border-color: var(--panel-accent);
  background: var(--panel-hover);
  color: var(--panel-accent);
  font-weight: 700;
  box-shadow: inset 0 -2px var(--panel-accent);
}

.htr-footer {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 9px;
  margin-top: 2px;
  padding-top: 11px;
  border-top: 1px solid var(--panel-border);
}

.htr-note {
  line-height: 1.25;
}

.htr-toast {
  min-width: 190px;
  padding: 9px 11px;
  border: 1px solid var(--panel-border);
  border-left: 3px solid var(--panel-accent);
  border-radius: 6px;
  background: var(--panel-bg);
  color: var(--panel-text);
  box-shadow: 0 9px 24px rgb(0 0 0 / 24%);
}

.htr-toast[hidden] {
  display: none;
}

button:focus-visible {
  outline: 2px solid var(--panel-focus);
  outline-offset: 2px;
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
}
`;

  activateRoot();
  addThemeStyle();
  watchAutomaticTheme();
  registerMenus();
  startWhenReady();
})();
