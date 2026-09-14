# HubSpot Ticket Refined

![Version](https://img.shields.io/badge/version-0.3.0-087b76)
![License](https://img.shields.io/badge/license-MIT-2563eb)
![Platform](https://img.shields.io/badge/platform-Tampermonkey-111827)

<p align="center">
  <a href="https://ko-fi.com/X8K126YVER">
    <img height="42" src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Buy me a coffee on Ko-fi" />
  </a>
</p>

<p align="center">
  <sub><em>If this project helps you, a coffee helps me keep working on it.</em></sub>
</p>

HubSpot Ticket Refined turns HubSpot's ticket list and ticket record pages into a calmer, denser workspace. It keeps the existing controls and data intact while sharpening hierarchy, reducing wasted space, and making long support sessions easier on the eyes.

![HubSpot Ticket Refined ticket list](assets/ticket-list-light.png)

![HubSpot Ticket Refined ticket record](assets/ticket-record-dark.png)

## What changes

- Shows roughly 22 ticket rows at 1742 x 984 with compact density.
- Turns queue metrics into one restrained overview band so the table stays dominant.
- Refines ticket records into a focused details rail, activity timeline, and context rail.
- Includes Midnight, Porcelain, and automatic color modes.
- Keeps the analytics shelf available in compact, full, or hidden form.
- Adapts when HubSpot collapses or removes the analytics shelf, without leaving a blank band.
- Preserves long ticket titles with a six-line summary and a full hover tooltip.
- Adds clear hover, focus, selected, loading, disabled, and semantic status treatments.

The script runs only on HubSpot ticket list and ticket record URLs. It checks visible status and priority labels to style rows, but it doesn't transmit or persist ticket content. Your preferences stay in the userscript manager's local storage.

## Install

1. Install Tampermonkey or Violentmonkey in your browser.
2. Open [the installable userscript](https://raw.githubusercontent.com/SysAdminDoc/HubSpot-Ticket-Refined/main/src/HubSpot-Ticket-Refined.user.js), then choose the userscript manager's install action.
3. Reload a HubSpot ticket page.

Use the **Refine** button near the lower-right corner to change theme, density, analytics shelf, or navigation width. The same settings are also available from the userscript manager menu.

![HubSpot Ticket Refined settings](assets/settings-panel-dark.png)

Packaged files and checksums are available on the [Releases page](https://github.com/SysAdminDoc/HubSpot-Ticket-Refined/releases).

## Development

Requirements: Node.js 22 or newer and Google Chrome for visual capture.

```text
npm install
npm run check
```

`npm run check` lints the source, exercises the settings and route behavior against sanitized fixtures, and builds the installable userscript plus ZIP and checksums.

## Compatibility

The selectors are based on HubSpot's updated ticket index and record layouts from September 2026. HubSpot can change its internal markup without notice. If the theme stops applying to part of a page, open an issue with the page type and a screenshot that contains no customer data.
