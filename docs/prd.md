# 1 · Overview

| Item                             | Value                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Product name (v 1.0)**         | **Patreon Exporter – “Post-to-PDF”**                                                                                             |
| **Primary goal**                 | Let any Patreon subscriber open a post in-browser and export the *clean* content column to a downloadable PDF, in **one click**. |
| **Secondary formats (road-map)** | Markdown, Word (docx), plain HTML bundle.                                                                                        |
| **Target browsers (v 1.0)**      | Chrome 120+, Edge 120+, Brave / Vivaldi / Arc (all Chromium) — via **WXT**; optional build for Firefox 122+.                     |
| **Monetisation**                 | Free extension; future Pro tier may add bulk export & cloud vault.                                                               |

---

# 2 · Problem & Opportunity

Patreon hides its best writing behind a login wall and its UI is not optimised for long-form reading.
Subscribers who want to *archive* or *read offline* must use the browser’s “Print ➝ Save as PDF”, which captures sidebars, CTAs and broken page breaks.

**Opportunity:** a one-tap “Export to PDF” button that strips noise, preserves images and typography, and works fully client-side (no server, no PII).

---

# 3 · Scope (v 1.0)

| Must-have                                                   | Nice-to-have                                  | Out-of-scope                                    |
| ----------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Detect Patreon post body and clone into hidden DOM node.    | “Batch mode” – export *every* post in a list. | Any feature that requires creator OAuth tokens. |
| Generate paginated PDF via **jsPDF** (client side).   | Light / dark theme detection.                 | Server-side rendering or storage.               |
| Single toolbar-button UX (popup with “Export” & settings).  | Firefox support (ship as β).                  | Editing PDFs in-app.                            |
| Store user prefs (e.g. page size) in `chrome.storage.sync`. | Per-site CSS overrides.                       | Mobile browsers (they block MV3).               |
| MV3 compliant; passes CWS review.                           | Context-menu “Export selection”.              | Safari build.                                   |

---

# 4 · User Stories

1. **Subscriber:** “As a reader on Patreon, I click the Export icon and immediately download a well-formatted PDF of the post I’m viewing.”
2. **Power user:** “I want to choose A4 vs Letter and whether to embed images at full resolution.”
3. **Future Writer Mode:** “I want to archive *all* of the creator’s posts on the screen in one go.”

---

# 5 · Functional Requirements

| ID      | Description                                                                                                      | Acceptance criteria                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **F-1** | Toolbar button appears only on `https://www.patreon.com/*`.                                                      | Icon visible; clicking opens popup.                            |
| **F-2** | Clicking “Export to PDF” triggers content-script scrape.                                                         | Page snapshot has **zero Patreon nav / comments / CTA** nodes. |
| **F-3** | PDF file keeps original inline images at ≥ 90 % JPEG quality.                                                    | Open PDF ≥ 300 DPI on retina; no missing images.               |
| **F-4** | Filename defaults to `${post-slug}.pdf`.                                                                         | Example: `my-latest-update.pdf`.                               |
| **F-5** | Download uses `chrome.downloads.download` so the Save As dialogue honours user’s location settings.              | Browser shows native download banner.                          |
| **F-6** | Extension requests only `activeTab`, `downloads`, `storage` and host permission for `https://www.patreon.com/*`. | Manifest lints clean; CWS review passes first time.            |

---

# 6 · Non-Functional Requirements

* **Performance:** end-to-end export ≤ 3 s on a 2-screen post (< 5 MB images).
* **Privacy:** *No* network calls beyond Patreon’s own assets; no analytics (GA) in v 1.0.
* **Accessibility:** popup UI keyboard-navigable, text ≥ 14 px, ARIA labels on controls.
* **Code quality:** TS 5.x strict mode; ESLint + Prettier; unit tests via Vitest; 80 % coverage.

---

# 7 · Technical Solution — High-level Architecture

```
┌───────────────┐      runtime messaging       ┌──────────────────┐
│   Popup UI    │  ───────────────────────────▶ │ Content Script   │
│ (React)       │   {cmd:"export"}             │ (scrape + pdf)   │
└───────────────┘                              └────────┬─────────┘
        ▲                                               │
        │                                               │
        │chrome.runtime.sendMessage                     │downloads.download()
        │                                               ▼
┌────────┴─────────┐                            ┌──────────────────┐
│ Background SW    │<───────────────────────────│ jsPDF      │
│ (Event-driven)   │   blobUrl + filename       └──────────────────┘
└──────────────────┘
```

---

# 8 · Technology Stack & Key Decisions

| Layer     | Choice                                            | Rationale                                           |
| --------- | ------------------------------------------------- | --------------------------------------------------- |
| Framework | **WXT** (Vite-powered, TS-native).                | Fast HMR, cross-browser builds.                     |
| UI        | React (WXT supports any framework). | Familiar dev base, small bundle.                    |
| PDF       | `jsPDF` ^0.9.3                              | All-client-side, zero licencing cost. ([GitHub][1]) |
| Language  | TypeScript strict, ES2022.                        | Typing across content ↔ worker.                     |

---

# 9 · Reference Configuration (official WXT syntax)

```ts
// wxt.config.ts  –  100 % spec-compliant
// docs: https://wxt.dev/guide/essentials/config/manifest
import { defineConfig } from 'wxt'          // :contentReference[oaicite:1]{index=1}

export default defineConfig({
  manifest: {
    name: 'Patreon Exporter',
    description: 'Export Patreon posts to clean PDFs for offline reading',
    version: '0.1.0',
    manifest_version: 3,
    permissions: ['activeTab', 'downloads', 'storage'],
    host_permissions: ['https://www.patreon.com/*'],
    action: { default_title: 'Export to PDF' }
  },
  targetBrowsers: ['chrome', 'edge', 'firefox']   // multi-build support :contentReference[oaicite:2]{index=2}
})
```

*WXT auto-generates `manifest.json` per target and merges MV2 where needed.* ([WXT][2])

---

# 10 · Development Workflow

1. **Bootstrap**

   ```bash
   npm create wxt@latest patreon-exporter
   cd patreon-exporter && npm i
   npm run dev         # live-reloads extension in your default browser
   ```

   *(Browser auto-startup config via `web-ext` is built-in.)* ([WXT][3])

2. **Coding rules**

   * Use `browser` polyfill from `wxt/browser` for API parity. ([WXT][4])
   * Keep long jobs (PDF render) inside **content script** to avoid the 30 s MV3 worker timeout.
   * Message-pass small payloads only; transfer the final Blob URL to the worker for download.

3. **Cross-browser test**

   ```bash
   npx wxt build --browsers=chrome,edge,firefox   # emits ZIPs per target
   ```

   Firefox output auto-adds `browser_specific_settings`. ([WXT][5])

---

# 12 · Future Road-map (backlog, not in v 1.0)

* **Markdown export** (`turndown` + zip images).
* **DOCX export** (generate → PizZip + `docxtemplater`).
* **Bulk creator archive** (rate-limited DOM crawling).
* **Reading queue** (IndexedDB – offline stash).
* **Safari build** via Xcode wrapper (WXT auto-generates project). ([WXT][6])

---

# 13 · Risks & Mitigations

| Risk                                                   | Mitigation                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Patreon DOM changes break selector.                    | Guard with fallback selectors; add e2e test that runs weekly on GitHub Actions.                  |
| Large image posts hit html2canvas memory limit.        | Detect total image size; down-scale >10 MB; offer “Low-res” toggle.                              |
| MV3 worker sleep interrupts big exports.               | Perform PDF generation inside the content script, not background.                                |
| Store review rejects due to “copyright circumvention.” | Clearly state “personal archival use only” in description & privacy policy; no sharing features. |

---

# 14 · Success Metrics

* **Crash-free export rate:** ≥ 99 % (captured via optional anonymous error ping).
* **First-week retention:** 50 % of installers use at least once after 7 days.
* **Support tickets:** < 5 % of MAU file issues regarding layout defects.
