# AI_CONTEXT.md — Breathe & Stretch Chrome Extension

> **For the next development task, see [`NEXT_TASK.md`](./NEXT_TASK.md).**

---

## High-Level Purpose

**Breathe & Stretch** is a Chrome MV3 extension that promotes desk-worker wellness. Every 20 minutes it shows a full-screen overlay with a breathing or stretching tip, a 30-second countdown ring, and an optional Tibetan singing bowl tone. After 30 seconds the overlay auto-dismisses and the break is recorded toward a Zen Garden stat tracker in the options page.

Zero external network requests. No accounts. No analytics. All data lives in `chrome.storage.sync`.

---

## Directory Structure

```
health-ext/
├── manifest.json         # MV3 manifest
├── background.js         # Service worker — alarms, tab messaging, icon drawing
├── overlay.js            # Shared overlay UI module (content script + break.html)
├── overlay.css           # Styles for overlay, warn toast, ring timer
├── content.js            # Thin content-script router (message → overlay)
├── break.html            # Fallback tab for restricted pages (chrome://, etc.)
├── break.js              # break.html logic — pops storage payload, closes tab
├── popup.html            # Toolbar popup layout
├── popup.js              # Popup: preview break, open options, show zen stat
├── options.html          # Full options page layout
├── options.js            # Options: zen garden, icon picker, affirmations, toggles
├── options.css           # Options page styles
├── images/
│   ├── bowl-16.png       # Toolbar/extension icons (4 sizes)
│   ├── bowl-32.png
│   ├── bowl-48.png
│   └── bowl-128.png
├── index.html            # GitHub Pages marketing landing page (not part of extension)
├── PRIVACY.md            # Privacy policy (rendered at GitHub Pages)
├── TERMS.md              # Terms of service
├── CODEBASE.md           # Human-readable architecture reference
├── AI_CONTEXT.md         # This file — AI handoff architecture reference
├── REPO_DIGEST.md        # All extension source files consolidated for AI ingestion
├── SESSION_SNAPSHOT.json # Machine-readable project state snapshot (handoff-v1 branch)
├── NEXT_TASK.md          # Current development objective (handoff-v1 branch)
├── zip-build.sh          # Builds breathe-and-stretch-<version>.zip for CWS upload
└── generate_icons.py     # One-off Python/Pillow script that produced the PNG icons
```

---

## Chrome API Permissions

| Permission | Why |
|---|---|
| `alarms` | 20-min break alarm, 19-min warning alarm, 5-min meeting-delay alarm |
| `tabs` | Query active tab URL (meeting detection), send messages, create break.html tab, close break.html tab |
| `storage` | `sync` for user prefs + break stats; `session` for ephemeral overlay payload (Chrome ≥102); `local` as session fallback |

No `host_permissions` — content scripts declared in manifest cover `https://*/*` and `http://*/*`.

---

## Background Service Worker (`background.js`)

### Alarms

| Alarm name | Fires at | Action |
|---|---|---|
| `breathe-stretch-alarm` | every 20 min | `triggerOverlayOrDelay()` |
| `breathe-stretch-warn` | every 19 min | `triggerWarning()` — warn toast "1 minute away" |
| `breathe-stretch-delayed` | once, 5 min after meeting detected | `triggerOverlayOrDelay()` |

Both alarms are created on `onInstalled` and re-checked on `onStartup` (service workers can die between alarms).

### Meeting Detection (`triggerOverlayOrDelay`)

Checks open tabs for URLs matching `zoom.us`, `meet.google.com`, `teams.microsoft.com`, `teams.live.com`. If a match is found, creates the 5-min delayed alarm and sends a warn toast to that tab. Controlled by `scanAllWindows` setting (default `true` — all windows; `false` — active window only). **Skipped during test triggers.**

### Tab Messaging (`sendToActiveTab`)

1. Queries the active tab in the current window.
2. If injectable (`https://`, `http://`, own extension origin), sends the message directly.
3. If the active tab is restricted (e.g. `chrome://newtab`):
   - `SHOW_WARN_TOAST` — silently skipped (not worth opening a tab for a toast).
   - `SHOW_OVERLAY` — stashes `{ ...message, createdAt, nonce, openerTabId, openerWindowId }` in `chrome.storage.session` (falls back to `chrome.storage.local` on Chrome <102), then opens `break.html`.

### Break Counting (`BREAK_COMPLETED`)

- `seenSessions` Set holds `sessionId` strings; prevents double-counting if both a content-script context and break.html somehow fire completion for the same overlay.
- Trimmed to 50 entries to avoid unbounded growth.
- Increments `breaksCompleted` and `totalMindfulnessSeconds` (+30 per break) in `chrome.storage.sync`.
- Stats are **never** incremented at alarm-fire time — only on natural 30-second completion.

### Dynamic Toolbar Icon

`drawEmojiIcon(emoji, size)` renders an emoji to an `OffscreenCanvas` and returns `ImageData`. `setIconFromEmoji` calls this for all 4 sizes atomically. `restoreIcon()` reads `iconChoice` from sync storage and re-applies — called on both `onInstalled` and `onStartup` so dev reloads don't reset to a blank icon.

---

## Overlay Module (`overlay.js` + `overlay.css`)

Guarded by `window.__bsOverlayLoaded` to prevent double-init (the file is injected by the manifest **and** loaded directly by break.html).

### `showOverlay(tip, audioEnabled, isTest)`

- Normalises `tip` to `safeTip` defaulting to `{ emoji: "🧘", text: "Take a slow breath." }` if the argument is missing or malformed.
- Builds the entire DOM with `createElement`/`createElementNS` — **no `innerHTML`** — to satisfy Trusted Types CSP on strict host pages.
- Generates a random `sessionId` (used in `BREAK_COMPLETED` de-duplication).
- SVG ring timer: circumference = `2π × 44`; `strokeDashoffset` decrements each second.
- In **test mode** (`isTest = true`): adds a dismiss button (✕), shows "Preview mode" subtext, ESC/dismiss button both work, `BREAK_COMPLETED` is **not** sent.
- In **normal mode**: overlay cannot be dismissed by the user; sends `BREAK_COMPLETED` when countdown reaches 0.
- Blocks scroll/activation keys (`Space`, `Enter`, arrow keys) but lets everything else through.

### `dismissOverlay(overlay)`

- Calls `_cleanup()` (removes key listeners, clears interval) and `_audioCleanup()` (closes AudioContext).
- Adds `bs-fade-out` class to trigger CSS fade animation.
- Uses a `finished` flag shared between `animationend` listener and a 600ms `setTimeout` fallback — guards against `animationend` never firing (e.g. `prefers-reduced-motion`).
- Dispatches `window.dispatchEvent(new Event("bs:overlayClosed"))` after removal.

### `setupAudio(audioEnabled, overlay)`

Web Audio API singing bowl synthesis: 4 harmonics (ratios 1, 2.756, 5.404, 8.933 relative to 330 Hz base), linear attack + exponential decay. Strikes at t=0, 12, 24 seconds. If AudioContext autoplay is blocked, shows a "Tap for bells" button.

### `showWarnToast(text)`

Fixed-position bottom-center toast. Auto-removes after 5 seconds with CSS transition.

---

## Content Script (`content.js`)

Guarded by `window.__bsContentLoaded`. Routes two message types:

- `SHOW_OVERLAY` → `window.bsShowOverlay?.(message.tip, message.audioEnabled, message.isTest)`
- `SHOW_WARN_TOAST` → `window.bsShowWarnToast?.(message.text)`

Optional chaining prevents TypeError if `overlay.js` failed to initialise.

---

## Break Page (`break.html` + `break.js`)

Used when the active tab is a restricted page that can't receive content scripts.

`popPendingOverlay()` (in `break.js`):
1. Tries `chrome.storage.session`, falls back to `chrome.storage.local`.
2. Clears storage **before** any `return` to avoid stale payloads.
3. Returns `null` (→ `closeThisTab()`) if:
   - No payload found.
   - `data.tip` is missing.
   - Payload is older than 2 minutes (stale TTL).
4. Returns the payload to `showOverlay`.

After `dismissOverlay` fires, `break.js` listens for `bs:overlayClosed` and calls `closeThisTab()` (`chrome.tabs.getCurrent` + `chrome.tabs.remove`).

---

## Popup (`popup.html` + `popup.js`)

- **Preview Break** button → `chrome.runtime.sendMessage({ type: "TRIGGER_NOW", test: true })` + `window.close()`.
- **Customize & Stats** button → `chrome.runtime.openOptionsPage()` + `window.close()`.
- On load: reads `breaksCompleted` from sync storage; if > 0, displays the current zen-stage emoji and break count.

---

## Options Page (`options.html` + `options.js`)

### Zen Garden

6 flower stages keyed on `breaksCompleted`:

| Breaks | Emoji | Name |
|---|---|---|
| 0 | 🌰 | Acorn |
| 1 | 🌱 | Sprout |
| 5 | 🌿 | Seedling |
| 15 | 🌷 | Bud |
| 30 | 🌸 | Blossom |
| 50 | 🌺 | Full Bloom |

Also displays `totalMindfulnessSeconds` converted to minutes.

### Icon Picker

8 emoji options rendered as a grid of cards (built with `createElement` — no `innerHTML`). Clicking a card: updates `chrome.storage.sync`, sends `SET_ICON` message to background.

### Custom Affirmations

Free-text affirmations stored as newline-separated string in `customTips`. Mixed into break tip pool at runtime in background.js. Options page provides add/delete CRUD.

### Toggles

| Setting | Storage key | Default |
|---|---|---|
| Tibetan bell audio | `audioEnabled` | `false` |
| Scan all windows for meetings | `scanAllWindows` | `true` |

### Next Break Timer

Reads `breathe-stretch-alarm.scheduledTime`, displays minutes remaining. Refreshes every 30 seconds.

---

## `chrome.storage.sync` Schema

| Key | Type | Default | Purpose |
|---|---|---|---|
| `breaksCompleted` | number | 0 | Total completed breaks (Zen Garden) |
| `totalMindfulnessSeconds` | number | 0 | Total seconds of break time |
| `iconChoice` | string | `"meditator"` | Toolbar icon key |
| `customTips` | string | `""` | Newline-separated affirmations |
| `audioEnabled` | boolean | `false` | Play singing bowl on break |
| `scanAllWindows` | boolean | `true` | Meeting detection scope |

---

## Build

```bash
# Produces breathe-and-stretch-<version>.zip for Chrome Web Store upload
./zip-build.sh
```

Excludes: `.git/`, `.claude/`, `node_modules/`, `generate_icons.py`, `*.zip`, `zip-build.sh` itself.

No npm, no bundler, no transpilation. Load unpacked directly from the project root in `chrome://extensions` with Developer Mode on.

---

## Source of truth for loading

- **Loaded-unpacked path**: the repository root (`/health-ext/`) — there is no `dist/`, `build/`, or compilation step.
- **Build command**: `./zip-build.sh` produces the Chrome Web Store submission artifact (`breathe-and-stretch-<version>.zip`). It is a packaging step only — it zips the source files as-is. It does not transform or transpile any code.
- **Generated files**: `images/bowl-{16,32,48,128}.png` were generated once by `generate_icons.py` (Python/Pillow, 4× supersampling + LANCZOS downscale) and committed. They are static assets, not regenerated at build time.
- **Source-of-truth files** (edited directly, never generated): `manifest.json`, `background.js`, `overlay.js`, `overlay.css`, `content.js`, `break.html`, `break.js`, `popup.html`, `popup.js`, `options.html`, `options.js`, `options.css`.
- **Not loaded by Chrome** (excluded from zip): `index.html`, `PRIVACY.md`, `TERMS.md`, `CODEBASE.md`, `AI_CONTEXT.md`, `REPO_DIGEST.md`, `SESSION_SNAPSHOT.json`, `NEXT_TASK.md`, `zip-build.sh`, `generate_icons.py`, `.git/`, `.claude/`.

---

## Known Limitations / Technical Debt

- **`chrome.storage.session` fallback**: On Chrome <102 the payload falls back to `chrome.storage.local`, which persists across browser restarts. A stale payload is mitigated by the 2-minute TTL check in `break.js`, but the local entry will linger until a restart triggers the code path that clears it.
- **`seenSessions` is ephemeral**: The Set lives only for the service-worker lifetime. A service worker restart between `BREAK_COMPLETED` fire and the Set check is theoretically possible but practically harmless (it just allows a single double-count, which is rare).
- **No interval configurability**: Break interval is hard-coded to 20 minutes in `background.js` (`INTERVAL_MINUTES = 20`). A UI control for this would require re-creating alarms on change.
- **Single-window meeting detection edge case**: If `scanAllWindows` is `false` and the user has a meeting tab in a non-active window, the break will not be delayed.

---

## Next Development Task

See [`NEXT_TASK.md`](./NEXT_TASK.md).

---

## Schema Notes

- **`externally_connectable`**: Not declared in `manifest.json`. The extension does not expose a messaging endpoint to external web pages or other extensions. No action required.
- **`web_accessible_resources`**: Not declared in `manifest.json`. No extension resources are intentionally exposed to web pages (overlay.js/overlay.css are injected by the manifest, not fetched by page scripts). No action required.
- **`host_permissions`**: Not declared as a separate key. Content-script URL matching (`https://*/*`, `http://*/*`) is handled via the `content_scripts.matches` array, which is sufficient for MV3 injection without needing explicit `host_permissions` for this use case.
