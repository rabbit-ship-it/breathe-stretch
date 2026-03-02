# Breathe & Stretch — Codebase Summary

_Generated: March 2026 · Chrome Extension Manifest V3_

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File Structure](#2-file-structure)
3. [manifest.json](#3-manifestjson)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Background Service Worker — background.js](#5-background-service-worker--backgroundjs)
6. [Shared Overlay Module — overlay.js](#6-shared-overlay-module--overlayjs)
7. [Content Script — content.js](#7-content-script--contentjs)
8. [Break Page — break.html + break.js](#8-break-page--breakhtml--breakjs)
9. [Popup — popup.html + popup.js](#9-popup--popuphtml--popupjs)
10. [Options Page — options.html + options.js](#10-options-page--optionshtml--optionsjs)
11. [Styles — overlay.css + options.css](#11-styles--overlaycss--optionscss)
12. [Storage Schema](#12-storage-schema)
13. [Message Protocol](#13-message-protocol)
14. [Permissions Rationale](#14-permissions-rationale)
15. [Key Design Decisions](#15-key-design-decisions)

---

## 1. Project Overview

Breathe & Stretch is a privacy-first Chrome MV3 extension that displays a calming full-screen break overlay every 20 minutes. It includes:

- A 30-second overlay with a wellness tip, SVG ring countdown, and optional singing-bowl audio
- **Smart Pause** — detects active video-call tabs and delays breaks by 5 minutes
- **1-minute warning toast** shown before each break
- **Zen Garden** — a visual progress tracker that grows through emoji stages as breaks accumulate
- **Custom affirmations** that mix into the tip rotation
- **Toolbar icon picker** — 8 emoji options rendered dynamically via `OffscreenCanvas`
- Zero network requests, zero external dependencies, no user account

---

## 2. File Structure

```
health-ext/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker: alarms, messaging, icon, meeting detection
├── overlay.js             # Shared UI module: overlay + warn toast (injected on all pages)
├── content.js             # Thin content script: routes runtime messages to overlay.js
├── break.html             # Fallback tab for restricted pages (chrome://, etc.)
├── break.js               # Reads stashed payload, shows overlay, closes tab on dismiss
├── popup.html             # Toolbar popup HTML
├── popup.js               # Popup logic: preview break, open options, show zen stat
├── options.html           # Full-page settings UI
├── options.js             # Options logic: zen garden, icon picker, affirmations, toggles
├── overlay.css            # Overlay + warn-toast styles (bs- prefixed, injected globally)
├── options.css            # Options page styles
├── images/
│   ├── bowl-16.png        # Extension store icon (16×16)
│   ├── bowl-32.png        # Extension store icon (32×32)
│   ├── bowl-48.png        # Extension store icon (48×48)
│   └── bowl-128.png       # Extension store icon (128×128)
├── index.html             # Public landing page (GitHub Pages)
├── PRIVACY.md             # Privacy policy
├── TERMS.md               # Terms of use
├── zip-build.sh           # Packages extension for Chrome Web Store upload
└── .gitignore
```

---

## 3. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Breathe & Stretch",
  "version": "1.0.0",
  "description": "Every 20 minutes, take a 30-second health break with a calming full-screen reminder.",
  "permissions": ["alarms", "tabs", "storage"],
  "icons": {
    "16":  "images/bowl-16.png",
    "32":  "images/bowl-32.png",
    "48":  "images/bowl-48.png",
    "128": "images/bowl-128.png"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://*/*", "http://*/*"],
      "js": ["overlay.js", "content.js"],
      "css": ["overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_title": "Breathe & Stretch",
    "default_popup": "popup.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  }
}
```

**Key points:**
- `overlay.js` is listed **before** `content.js` in `content_scripts.js` so its exports (`window.bsShowOverlay`, `window.bsShowWarnToast`) are available when `content.js` runs.
- No `activeTab`, `scripting`, or `host_permissions` — the content script is declared in the manifest, not injected programmatically.
- `tabs` is needed solely for meeting-URL detection and for `sendMessage` to specific tab IDs.
- `storage` covers `sync`, `local`, and `session` storage APIs.

---

## 4. Architecture & Data Flow

### Normal break flow (http/https tab active)

```
chrome.alarms (20 min)
  └─► background.js: triggerOverlayOrDelay()
        ├─ [Smart Pause] query tabs for meeting domains
        │    └─ if meeting found → create DELAYED_ALARM (5 min), send SHOW_WARN_TOAST to meeting tab
        ├─ pick random tip from HEALTH_TIPS + customTips
        ├─ sendToActiveTab({ type: "SHOW_OVERLAY", tip, audioEnabled, isTest: false })
        │    └─ chrome.tabs.sendMessage(tab.id, message)
        │         └─► content.js: onMessage → window.bsShowOverlay(tip, audioEnabled, false)
        │                  └─► overlay.js: showOverlay() injects overlay DOM, starts countdown
        └─ increment breaksCompleted + totalMindfulnessSeconds in chrome.storage.sync
```

### Warning toast flow (1 minute before break)

```
chrome.alarms (19 min, periodic)
  └─► background.js: triggerWarning()
        └─ sendToActiveTab({ type: "SHOW_WARN_TOAST", text: "..." })
             └─► content.js: onMessage → window.bsShowWarnToast(text)
                      └─► overlay.js: showWarnToast() — non-blocking bottom toast, auto-dismisses in 5s
```

### Restricted-tab fallback (chrome://, edge://, about:, etc.)

```
sendToActiveTab() — no injectable tab found
  └─ stash payload in chrome.storage.session (fallback: chrome.storage.local)
       payload = { type, tip, audioEnabled, isTest, createdAt, nonce, openerTabId, openerWindowId }
  └─ chrome.tabs.create({ url: chrome.runtime.getURL("break.html") })
       └─► break.html loads overlay.js + break.js
             └─► break.js: popPendingOverlay()
                   ├─ reads & clears pendingOverlay from session/local storage
                   ├─ checks 2-minute TTL (createdAt)
                   └─ window.bsShowOverlay(tip, audioEnabled, isTest)
                        └─ on "bs:overlayClosed" event → chrome.tabs.remove(tab.id)
```

### Preview (test) flow

```
popup.js or options.js
  └─ chrome.runtime.sendMessage({ type: "TRIGGER_NOW", test: true })
       └─► background.js: triggerOverlayOrDelay(isTest = true)
             ├─ skips meeting detection
             ├─ skips stat increment
             └─ sendToActiveTab({ ..., isTest: true })
                  └─► overlay.js: showOverlay(tip, audioEnabled, isTest = true)
                        ├─ adds ✕ dismiss button
                        ├─ any keydown dismisses the overlay
                        └─ subtext: "Preview mode · press any key to dismiss"
```

---

## 5. Background Service Worker — background.js

The service worker is the central coordinator. It never touches the DOM.

### Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ALARM_NAME` | `"breathe-stretch-alarm"` | Main 20-min periodic alarm |
| `WARN_ALARM_NAME` | `"breathe-stretch-warn"` | 1-min-early warning alarm |
| `DELAYED_ALARM_NAME` | `"breathe-stretch-delayed"` | One-shot 5-min delay when meeting detected |
| `INTERVAL_MINUTES` | `20` | Break cadence |
| `MEETING_DOMAINS` | zoom.us, meet.google.com, teams.microsoft.com, teams.live.com | Smart Pause domain list |

### Icon system

`drawEmojiIcon(emoji, size)` — renders an emoji to `OffscreenCanvas` and returns `ImageData`.
`setIconFromEmoji(emoji)` — sets the toolbar icon at 16/32/48/128px simultaneously.
`restoreIcon()` — reads `iconChoice` from `chrome.storage.sync` and reapplies the emoji icon. Called on both `onInstalled` and `onStartup` to survive extension reloads in developer mode.

### Alarm lifecycle

- `onInstalled` → `createAlarms()` + `restoreIcon()`
- `onStartup` → `restoreIcon()` + conditionally recreate alarms if missing (service worker restart)
- `onAlarm`:
  - `ALARM_NAME` or `DELAYED_ALARM_NAME` → `triggerOverlayOrDelay()`
  - `WARN_ALARM_NAME` → `triggerWarning()`

### `isInjectable(url)`

Returns `true` only for:
- `https://` pages
- `http://` pages
- `chrome-extension://<own-id>/` pages (the options page)

Rejects all other schemes: `chrome://`, `edge://`, `about:`, `devtools://`, `view-source:`, `data:`, `blob:`, other extensions.

### `sendToActiveTab(message)`

1. Queries `{ active: true, currentWindow: true }` tabs.
2. Sends `chrome.tabs.sendMessage` to the first injectable tab found.
3. If none found, builds a full payload with `createdAt`, `nonce`, `openerTabId`, `openerWindowId`, stashes it in `chrome.storage.session` (falls back to `chrome.storage.local` on Chrome < 102), then opens `break.html` in a new tab.

### `triggerOverlayOrDelay(isTest = false)`

1. If `!isTest`: queries tabs for meeting domains (scope controlled by `scanAllWindows` setting). If a meeting tab is found, creates a 5-min one-shot alarm and sends a warning toast to that tab.
2. Reads `customTips` and `audioEnabled` from sync storage.
3. Merges built-in `HEALTH_TIPS` with parsed custom tips; picks a random entry.
4. Calls `sendToActiveTab({ type: "SHOW_OVERLAY", tip, audioEnabled, isTest })`.
5. If `!isTest`: increments `breaksCompleted` (+1) and `totalMindfulnessSeconds` (+30).

### Message listener

| `message.type` | Action |
|---------------|--------|
| `TRIGGER_NOW` | `triggerOverlayOrDelay(message.test === true)` |
| `SET_ICON` | `setIconFromEmoji(ICON_EMOJIS[message.choice])` |

---

## 6. Shared Overlay Module — overlay.js

Guards with `window.__bsOverlayLoaded` to prevent double-initialisation when loaded by both the manifest content script pipeline and directly by `break.html` or `options.html`.

Exports two globals:
- `window.bsShowOverlay(tip, audioEnabled, isTest)`
- `window.bsShowWarnToast(text)`

### `showWarnToast(text)`

Injects a `#bs-warn-toast` div at the bottom of the page. Appears with a CSS transition, auto-removes after 5 seconds. Replaces any existing toast before creating a new one.

### `setupAudio(audioEnabled, overlay)`

Synthesises a Tibetan singing bowl using the Web Audio API:
- 4 harmonics (ratios: 1×, 2.756×, 5.404×, 8.933× of 330 Hz base)
- Each harmonic: sine oscillator → gain node with `linearRampToValueAtTime` attack (40ms) and `exponentialRampToValueAtTime` decay (3–10s)
- Strikes scheduled at 0s, 12s, 24s via `scheduleStrikes()`
- If `AudioContext.state` is `"suspended"` (autoplay policy), shows a "🎵 Tap for bells" button that resumes the context on click

### `showOverlay(tip, audioEnabled, isTest)`

1. Guards against duplicate overlay (`#breathe-stretch-overlay` already present).
2. Creates overlay `<div>` with `role="dialog"`, `aria-modal="true"`, `aria-label="Health break"`.
3. Sets `tip.emoji` and `tip.text` via `textContent` (XSS-safe).
4. Starts a `setInterval` countdown from 30s; updates the SVG ring `strokeDashoffset` and countdown number each second.
5. Blocks scroll/activation keys (`Space`, `Enter`, arrow keys) via a capturing `keydown` listener. All other keys (including `Cmd+R`) pass through.
6. **Test mode extras:** adds `✕` dismiss button; adds a capturing `keydown` handler that dismisses on **any** key.
7. Calls `setupAudio()`.

### `dismissOverlay(overlay)`

Runs `overlay._cleanup()` (removes key listeners, clears interval) and `overlay._audioCleanup()` (closes AudioContext), adds `bs-fade-out` class, then on `animationend`: removes the element and fires `window.dispatchEvent(new Event("bs:overlayClosed"))`.

---

## 7. Content Script — content.js

Guards with `window.__bsContentLoaded`. Registers a single `chrome.runtime.onMessage` listener that delegates to `overlay.js` exports:

```js
if (message.type === "SHOW_OVERLAY" && message.tip)
  window.bsShowOverlay(message.tip, message.audioEnabled, message.isTest);

if (message.type === "SHOW_WARN_TOAST" && message.text)
  window.bsShowWarnToast(message.text);
```

Also loaded by `options.html` via a `<script>` tag (alongside `overlay.js`) so that the "Preview" button on the options page triggers an overlay on that same page rather than opening a new tab.

---

## 8. Break Page — break.html + break.js

Used as a fallback when the active tab is a restricted page (e.g. `chrome://extensions/`).

### break.html

Minimal page with a dark background (`#0f172a`). Loads `overlay.js` then `break.js` — no `content.js` needed since `break.js` calls `window.bsShowOverlay` directly.

### break.js — `popPendingOverlay()`

1. Tries `chrome.storage.session.get("pendingOverlay")` — falls back to `chrome.storage.local` if session storage throws (Chrome < 102).
2. Immediately removes `pendingOverlay` from whichever store succeeded.
3. Returns `null` if no payload or if `Date.now() - data.createdAt > 120_000` (2-minute TTL).

After retrieving the payload:
- Calls `window.bsShowOverlay(data.tip, data.audioEnabled, data.isTest)`.
- Listens (once) for `bs:overlayClosed` → `chrome.tabs.getCurrent(tab => chrome.tabs.remove(tab.id))` to close the break tab automatically.

---

## 9. Popup — popup.html + popup.js

A 220px-wide panel. Two buttons:

| Button | Action |
|--------|--------|
| **Preview Break** (`#testBtn`) | `chrome.runtime.sendMessage({ type: "TRIGGER_NOW", test: true })` then `window.close()` |
| **⚙ Customize & Stats** (`#optionsBtn`) | `chrome.runtime.openOptionsPage()` then `window.close()` |

On load, reads `breaksCompleted` from sync storage. If > 0, displays a zen-stage emoji and count in `#statsLine` (e.g. "🌸 12 breaks completed"). Stage thresholds mirror the options page: 0/1/5/15/30/50.

---

## 10. Options Page — options.html + options.js

Full-page settings UI (`open_in_tab: true`). Script load order: `overlay.js` → `content.js` → `options.js`.

### Header — Next Break Countdown

`updateNextBreakTimer()` calls `chrome.alarms.get("breathe-stretch-alarm")` and displays remaining minutes. Refreshes every 30 seconds via `setInterval`. A **Preview** button sends `{ type: "TRIGGER_NOW", test: true }` to trigger a preview overlay on the options page itself (handled by the `content.js` message listener loaded in-page).

### Section 1: Zen Garden

`FLOWER_STAGES` array defines 6 stages:

| Stage | Min breaks | Emoji | Name |
|-------|-----------|-------|------|
| 0 | 0 | 🌰 | Acorn |
| 1 | 1 | 🌱 | Sprout |
| 2 | 5 | 🌿 | Seedling |
| 3 | 15 | 🌷 | Bud |
| 4 | 30 | 🌸 | Blossom |
| 5 | 50 | 🌺 | Full Bloom |

`getFlowerStage(breaks)` iterates stages and returns the last one whose `min` threshold is met.

`loadZenGarden()` reads `breaksCompleted` and `totalMindfulnessSeconds`, updates the animated flower emoji (`data-stage` attribute drives CSS font-size and glow), the motivational message, and the breaks/minutes stats. The flower is wrapped in a `user-select: none; pointer-events: none` container so it can't be highlighted.

### Section 2: Icon Picker

`buildIconGrid(currentKey)` renders 8 `icon-card` divs. Clicking a card:
1. Removes `selected` class from all cards, adds to clicked.
2. `chrome.storage.sync.set({ iconChoice: key })`
3. `chrome.runtime.sendMessage({ type: "SET_ICON", choice: key })`
4. Shows "Icon updated! ✓" toast.

### Section 3: Custom Affirmations

`getAffirmations()` / `saveAffirmations(list)` — read/write `customTips` (newline-delimited string) from sync storage.

`renderAffirmations(list)` — builds the list with a `×` delete button per item. Delete splices the array and saves immediately.

`addAffirmationBtn` — splits textarea input on newlines, appends to existing list, saves, re-renders, clears input.

### Section 4: Audio Toggle

Checkbox bound to `audioEnabled` in sync storage. Toast on change.

### Section 5: Meeting Detection Toggle

Checkbox bound to `scanAllWindows` in sync storage. When enabled, background queries all tabs for meeting domains; when disabled, only the active window is checked.

---

## 11. Styles — overlay.css + options.css

### overlay.css

All selectors prefixed with `bs-` to avoid collisions with host-page styles.

- `#breathe-stretch-overlay` — `position: fixed; inset: 0; z-index: 2147483647` (max). Frosted-glass backdrop (`rgba(15,23,42,0.82)` + `backdrop-filter: blur(8px)`). `pointer-events: all` blocks all underlying page interaction.
- `.bs-card` — `position: relative` (needed to anchor `.bs-dismiss-btn`). Dark gradient card, max-width 480px.
- `.bs-dismiss-btn` — absolutely positioned top-right, 28×28px, only rendered in test/preview mode.
- `.bs-ring-progress` — SVG circle with `stroke: #38bdf8`, `stroke-linecap: round`, `transition: stroke-dashoffset 1s linear`.
- `#bs-warn-toast` — `position: fixed; bottom: 24px` non-blocking toast, `z-index: 2147483646` (one below overlay).
- Keyframes: `bs-fade-in`, `bs-fade-out` (scale 0.97↔1 + opacity), `bs-float` (translateY 0↔−8px).

### options.css

Dark theme matching the overlay: `background: #0f172a`, cards `#1e293b`, accent `#38bdf8`.

Notable components:
- `.zen-flower[data-stage="N"]` — CSS attribute selectors drive font-size (44px → 92px) and a golden `drop-shadow` at stage 5.
- `@keyframes zen-sway` — gentle ±3° rotation on the flower emoji.
- `.toggle` / `.toggle-track` / `.toggle-thumb` — pure CSS toggle switch.
- `.next-break-bar` — flex row with the countdown and Preview button.

---

## 12. Storage Schema

All user-facing data lives in `chrome.storage.sync` (syncs across Chrome profile, never leaves the device to our servers).

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `iconChoice` | `string` | `"meditator"` | Key into `ICON_EMOJIS` map |
| `audioEnabled` | `boolean` | `false` | Whether to play singing bowl on breaks |
| `scanAllWindows` | `boolean` | `true` | Meeting detection scope (all tabs vs active window) |
| `customTips` | `string` | `""` | Newline-delimited affirmations |
| `breaksCompleted` | `number` | `0` | Count of real (non-test) breaks taken |
| `totalMindfulnessSeconds` | `number` | `0` | Total seconds spent in real breaks (30 per break) |

**Ephemeral storage** (not synced, used only for the restricted-tab fallback):

| Store | Key | TTL | Description |
|-------|-----|-----|-------------|
| `chrome.storage.session` (preferred) | `pendingOverlay` | 2 min | Full overlay payload for break.html |
| `chrome.storage.local` (fallback) | `pendingOverlay` | 2 min | Same, for Chrome < 102 |

Payload shape:
```js
{
  type:           "SHOW_OVERLAY",
  tip:            { emoji: string, text: string },
  audioEnabled:   boolean,
  isTest:         boolean,
  createdAt:      number,   // Date.now()
  nonce:          string,   // Math.random().toString(36).slice(2)
  openerTabId:    number | null,
  openerWindowId: number | null,
}
```

---

## 13. Message Protocol

All messages pass through `chrome.runtime.sendMessage` (page → background) or `chrome.tabs.sendMessage` (background → content script).

### Page → Background

| `type` | Extra fields | Sender | Effect |
|--------|-------------|--------|--------|
| `TRIGGER_NOW` | `test: boolean` | popup.js, options.js | Calls `triggerOverlayOrDelay(test)` |
| `SET_ICON` | `choice: string` | options.js | Calls `setIconFromEmoji(ICON_EMOJIS[choice])` |

### Background → Content Script

| `type` | Extra fields | Effect |
|--------|-------------|--------|
| `SHOW_OVERLAY` | `tip`, `audioEnabled`, `isTest` | `window.bsShowOverlay(tip, audioEnabled, isTest)` |
| `SHOW_WARN_TOAST` | `text` | `window.bsShowWarnToast(text)` |

---

## 14. Permissions Rationale

| Permission | Why needed |
|-----------|-----------|
| `alarms` | Schedule the 20-min break and 1-min warning on a persistent timer |
| `tabs` | (a) Query tab URLs for meeting detection; (b) `sendMessage` to specific tab IDs; (c) `create` the break.html fallback tab; (d) `getCurrent` in break.js to close the tab |
| `storage` | Read/write user settings (`sync`), and stash the pending overlay payload (`session`/`local`) |

Explicitly **not** requested: `activeTab`, `scripting`, `history`, `cookies`, `webRequest`, `identity`, `host_permissions`. Content scripts are declared in the manifest, not injected programmatically.

---

## 15. Key Design Decisions

**Shared `overlay.js` module.** Overlay logic is used in three contexts: normal pages (via content script), the options page (via direct `<script>` tag), and `break.html`. Extracting it into a single guarded module with `window.__bsOverlayLoaded` prevents duplication and double-initialisation.

**`bs:overlayClosed` custom event.** `break.js` needs to know when the overlay is dismissed so it can close the tab. A `window` custom event fired inside `dismissOverlay()` is simpler and more reliable than a MutationObserver watching for DOM removal.

**`isInjectable(url)` allowlist.** Rather than trying to catch every restricted scheme, the function uses a strict allowlist (`https://`, `http://`, own extension origin). Anything else gets the `break.html` fallback.

**`chrome.storage.session` with local fallback.** Session storage is ephemeral (cleared on browser restart, never synced), making it ideal for the short-lived `pendingOverlay` payload. The try/catch fallback to `local` storage supports Chrome < 102 where session storage was not yet available.

**No stat increment on test/preview.** `triggerOverlayOrDelay(isTest = true)` skips both meeting detection and the `breaksCompleted`/`totalMindfulnessSeconds` increment, so previewing a break never pollutes the Zen Garden progress.

**`restoreIcon()` on both `onInstalled` and `onStartup`.** During development, reloading the extension triggers `onInstalled` but not `onStartup`, which previously caused the toolbar icon to reset. Calling `restoreIcon()` in both handlers fixes this.

**XSS prevention.** User-controlled text (`tip.emoji`, `tip.text`, affirmations) is always written via `element.textContent`, never injected into `innerHTML`. The overlay's structural HTML is static; only the data slots use content assignment.

**Audio synthesis, not audio files.** The singing bowl is synthesised with the Web Audio API (4 harmonics, exponential decay) rather than loading an audio file — no network request, no file size, no autoplay policy issues with `src` attributes.
