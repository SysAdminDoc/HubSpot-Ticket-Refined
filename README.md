# HubSpot Ticket Refined

![Version](https://img.shields.io/badge/version-0.1.0-0f766e)
![License](https://img.shields.io/badge/license-MIT-2563eb)
![Platform](https://img.shields.io/badge/platform-Tampermonkey-111827)

HubSpot Ticket Refined gives the ticket list and ticket record pages a calmer, denser workspace. It keeps HubSpot's controls and data intact while reducing wasted space, clarifying status, and making long work sessions easier on the eyes.

![HubSpot Ticket Refined ticket list](assets/ticket-list-light.png)

![HubSpot Ticket Refined ticket record](assets/ticket-record-dark.png)

## What changes

- Fits more ticket rows on screen with compact or comfortable density.
- Refines ticket records across the left details, activity timeline, and right associations column.
- Includes Midnight, Porcelain, and automatic color modes.
- Keeps the analytics shelf available in compact, full, or hidden form.
- Uses stable HubSpot test hooks instead of generated class names where possible.
- Adds clear hover, focus, selected, loading, and status treatments.

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
