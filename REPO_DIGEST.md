# REPO_DIGEST — Breathe & Stretch Chrome Extension

> Auto-generated consolidation of all extension source files.
> Intended for AI ingestion. For architecture notes see `AI_CONTEXT.md`.
> For the next development task see `NEXT_TASK.md`.
>
> **Generated at:** 2026-03-04T23:00:00Z
>
> **Loaded-unpacked path:** repository root (no `dist/` or `build/` — source files are loaded directly).
>
> **Manifest verification:**
> - `externally_connectable`: **not present** in `manifest.json` — no external messaging endpoint exposed.
> - `web_accessible_resources`: **not present** in `manifest.json` — no extension resources are intentionally web-accessible.

---

### File: manifest.json

```json
{
  "manifest_version": 3,
  "name": "Breathe & Stretch",
  "version": "1.0.0",
  "description": "Every 20 minutes, take a 30-second health break with a calming full-screen reminder.",
  "permissions": [
    "alarms",
    "tabs",
    "storage"
  ],
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
  "icons": {
    "16":  "images/bowl-16.png",
    "32":  "images/bowl-32.png",
    "48":  "images/bowl-48.png",
    "128": "images/bowl-128.png"
  },
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

---

### File: background.js

```js
// De-duplicate BREAK_COMPLETED messages within a single service-worker lifetime.
const seenSessions = new Set();

const ALARM_NAME         = "breathe-stretch-alarm";
const WARN_ALARM_NAME    = "breathe-stretch-warn";
const DELAYED_ALARM_NAME = "breathe-stretch-delayed";
const INTERVAL_MINUTES   = 20;

const MEETING_DOMAINS = [
  "zoom.us",
  "meet.google.com",
  "teams.microsoft.com",
  "teams.live.com"
];

const HEALTH_TIPS = [
  { emoji: "🧘", text: "Take 3 slow, deep breaths." },
  { emoji: "🦒", text: "Gently stretch your neck — tilt each ear to your shoulder." },
  { emoji: "👀", text: "Look 20 feet away for 20 seconds. Rest your eyes." },
  { emoji: "🙆", text: "Roll your shoulders back 5 times. Release the tension." },
  { emoji: "💧", text: "Drink a glass of water. Stay hydrated!" },
  { emoji: "🤲", text: "Stretch your wrists — rotate them slowly in both directions." },
  { emoji: "🚶", text: "Stand up and walk for 30 seconds. Get your blood moving." },
  { emoji: "🧠", text: "Close your eyes and let your mind rest for a moment." },
  { emoji: "🌿", text: "Take a deep breath and notice something you're grateful for." },
  { emoji: "🖐️", text: "Spread your fingers wide, hold 5 seconds, then relax." },
  { emoji: "🔙", text: "Sit up straight and do a gentle back arch. Release." },
  { emoji: "😮‍💨", text: "Breathe in for 4 counts, hold for 4, out for 4. Box breathe." }
];

// ─── Icon helpers (canvas-based, no PNG files needed) ─────────────────────────

const ICON_EMOJIS = {
  meditator:  "🧘",
  meditatorM: "🧘‍♂️",
  bell:       "🔔",
  windchime:  "🎐",
  tea:        "🍵",
  leaf:       "🌿",
  namaste:    "🙏",
  wave:       "🌊",
};

function drawEmojiIcon(emoji, size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx    = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.font         = `${Math.round(size * 0.9)}px serif`;
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  return ctx.getImageData(0, 0, size, size);
}

function setIconFromEmoji(emoji) {
  chrome.action.setIcon({
    imageData: {
      16:  drawEmojiIcon(emoji, 16),
      32:  drawEmojiIcon(emoji, 32),
      48:  drawEmojiIcon(emoji, 48),
      128: drawEmojiIcon(emoji, 128),
    }
  });
}

function restoreIcon() {
  chrome.storage.sync.get({ iconChoice: "meditator" }, ({ iconChoice }) => {
    setIconFromEmoji(ICON_EMOJIS[iconChoice] ?? ICON_EMOJIS.meditator);
  });
}

// ─── Alarm management ─────────────────────────────────────────────────────────

function createAlarms() {
  chrome.alarms.create(ALARM_NAME,      { delayInMinutes: INTERVAL_MINUTES,     periodInMinutes: INTERVAL_MINUTES });
  chrome.alarms.create(WARN_ALARM_NAME, { delayInMinutes: INTERVAL_MINUTES - 1, periodInMinutes: INTERVAL_MINUTES });
}

chrome.runtime.onInstalled.addListener(() => {
  createAlarms();
  restoreIcon();
});

chrome.runtime.onStartup.addListener(async () => {
  restoreIcon();
  const [mainAlarm, warnAlarm] = await Promise.all([
    chrome.alarms.get(ALARM_NAME),
    chrome.alarms.get(WARN_ALARM_NAME),
  ]);
  if (!mainAlarm) chrome.alarms.create(ALARM_NAME,      { delayInMinutes: INTERVAL_MINUTES,     periodInMinutes: INTERVAL_MINUTES });
  if (!warnAlarm) chrome.alarms.create(WARN_ALARM_NAME, { delayInMinutes: INTERVAL_MINUTES - 1, periodInMinutes: INTERVAL_MINUTES });
});

// ─── Tab messaging helper ──────────────────────────────────────────────────────

// Returns true only for pages where our content script is actually running.
// Explicitly rejects: chrome://, edge://, about:, devtools://, view-source:,
// data:, blob:, and any chrome-extension:// origin that isn't our own.
function isInjectable(url) {
  if (!url) return false;
  return (
    url.startsWith("https://") ||
    url.startsWith("http://")  ||
    url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
  );
}

async function sendToActiveTab(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !isInjectable(tab.url)) continue;
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    return;
  }

  // Warn toasts on restricted pages can be silently skipped — only overlays need the fallback.
  if (message.type !== "SHOW_OVERLAY") return;

  // Active tab is a restricted page — stash payload and open a break page.
  const [activeTab] = tabs;
  const payload = {
    ...message,
    createdAt:      Date.now(),
    nonce:          Math.random().toString(36).slice(2),
    openerTabId:    activeTab?.id     ?? null,
    openerWindowId: activeTab?.windowId ?? null,
  };

  // Prefer session storage (ephemeral, not synced, cleared on browser restart).
  // Fall back to local storage on Chrome < 102 where session storage is absent.
  try {
    await chrome.storage.session.set({ pendingOverlay: payload });
  } catch {
    await chrome.storage.local.set({ pendingOverlay: payload });
  }

  chrome.tabs.create({ url: chrome.runtime.getURL("break.html") });
}

// ─── Feature: Gentle Warning ───────────────────────────────────────────────────

async function triggerWarning() {
  await sendToActiveTab({
    type: "SHOW_WARN_TOAST",
    text: "🌿 Your mindfulness break starts in 1 minute..."
  });
}

// ─── Feature: Smart Pause + Overlay ───────────────────────────────────────────

async function triggerOverlayOrDelay(isTest = false) {
  // Meeting detection — scope controlled by user setting (skip during tests)
  if (!isTest) {
    const { scanAllWindows = true } =
      await chrome.storage.sync.get({ scanAllWindows: true });

    const candidateTabs = await chrome.tabs.query(scanAllWindows ? {} : { active: true, currentWindow: true });
    const meetingTab = candidateTabs.find(
      tab => tab.url && MEETING_DOMAINS.some(d => tab.url.includes(d))
    );

    if (meetingTab) {
      chrome.alarms.create(DELAYED_ALARM_NAME, { delayInMinutes: 5 });
      chrome.tabs.sendMessage(meetingTab.id, {
        type: "SHOW_WARN_TOAST",
        text: "🤝 In a meeting — your break is gently delayed 5 minutes."
      }).catch(() => {});
      return;
    }
  }

  // Read settings
  const { customTips: rawCustom = "", audioEnabled = false } =
    await chrome.storage.sync.get({ customTips: "", audioEnabled: false });

  const custom = rawCustom
    .split("\n")
    .map(t => t.trim())
    .filter(Boolean)
    .map(text => ({ emoji: "✨", text }));

  const allTips = [...HEALTH_TIPS, ...custom];
  const tip = allTips[Math.floor(Math.random() * allTips.length)];

  await sendToActiveTab({ type: "SHOW_OVERLAY", tip, audioEnabled, isTest });
}

// ─── Alarm + message dispatch ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME || alarm.name === DELAYED_ALARM_NAME) {
    triggerOverlayOrDelay();
  } else if (alarm.name === WARN_ALARM_NAME) {
    triggerWarning();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRIGGER_NOW") triggerOverlayOrDelay(message.test === true);
  if (message.type === "SET_ICON")    setIconFromEmoji(ICON_EMOJIS[message.choice] ?? ICON_EMOJIS.meditator);

  if (message.type === "BREAK_COMPLETED") {
    // Ignore duplicates (e.g. content script + break.html both firing).
    if (!message.sessionId || seenSessions.has(message.sessionId)) return;
    seenSessions.add(message.sessionId);
    // Trim the set so it doesn't grow unbounded across a long browser session.
    if (seenSessions.size > 50) seenSessions.delete(seenSessions.values().next().value);

    chrome.storage.sync.get({ breaksCompleted: 0, totalMindfulnessSeconds: 0 }, (data) => {
      chrome.storage.sync.set({
        breaksCompleted:         data.breaksCompleted + 1,
        totalMindfulnessSeconds: data.totalMindfulnessSeconds + 30,
      });
    });
  }
});
```

---

### File: overlay.js

```js
// Shared overlay UI — injected by the manifest before content.js on normal pages,
// and loaded directly by break.html. Guard prevents double-initialisation.
if (!window.__bsOverlayLoaded) {
  window.__bsOverlayLoaded = true;

  const DURATION_SECONDS = 30;
  const OVERLAY_ID       = "breathe-stretch-overlay";
  const WARN_TOAST_ID    = "bs-warn-toast";

  // ─── Warning Toast ──────────────────────────────────────────────────────────

  function showWarnToast(text) {
    const existing = document.getElementById(WARN_TOAST_ID);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = WARN_TOAST_ID;
    toast.textContent = text;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("bs-warn-toast-show"));
    });

    setTimeout(() => {
      toast.classList.remove("bs-warn-toast-show");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 5000);
  }

  // ─── Singing Bowl Audio ─────────────────────────────────────────────────────

  function setupAudio(audioEnabled, overlay) {
    if (!audioEnabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    const audioCtx = new AC();

    function strike(offsetSeconds) {
      const BASE = 330;
      const HARMONICS = [
        { ratio: 1,     peak: 0.45, decay: 10 },
        { ratio: 2.756, peak: 0.25, decay: 7  },
        { ratio: 5.404, peak: 0.10, decay: 5  },
        { ratio: 8.933, peak: 0.04, decay: 3  }
      ];
      const t = audioCtx.currentTime + offsetSeconds;
      HARMONICS.forEach(({ ratio, peak, decay }) => {
        const osc      = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(BASE * ratio, t);
        gainNode.gain.setValueAtTime(0, t);
        gainNode.gain.linearRampToValueAtTime(peak, t + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + decay + 0.1);
      });
    }

    function scheduleStrikes() {
      [0, 12, 24].forEach(t => strike(t));
    }

    const audioBtn = overlay.querySelector(".bs-audio-btn");

    if (audioCtx.state === "running") {
      scheduleStrikes();
      if (audioBtn) audioBtn.style.display = "none";
    } else {
      // Autoplay blocked — show tap-to-play button
      if (audioBtn) {
        audioBtn.style.display = "flex";
        audioBtn.addEventListener("click", async () => {
          await audioCtx.resume();
          scheduleStrikes();
          audioBtn.style.display = "none";
        }, { once: true });
      }
    }

    overlay._audioCleanup = () => audioCtx.close().catch(() => {});
  }

  // ─── Overlay ────────────────────────────────────────────────────────────────

  function dismissOverlay(overlay) {
    if (overlay._cleanup)      overlay._cleanup();
    if (overlay._audioCleanup) overlay._audioCleanup();
    overlay.classList.add("bs-fade-out");

    // animationend may never fire if animations are disabled (prefers-reduced-motion,
    // OS accessibility settings, etc.). The timeout is a guaranteed fallback.
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.remove();
      window.dispatchEvent(new Event("bs:overlayClosed"));
    };
    overlay.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, 600); // slightly longer than the 0.4s CSS animation
  }

  function showOverlay(tip, audioEnabled, isTest = false) {
    // Normalise tip — if missing or malformed, use a safe default.
    const safeTip = (tip && typeof tip.emoji === "string" && typeof tip.text === "string")
      ? tip
      : { emoji: "🧘", text: "Take a slow breath." };

    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Health break");

    // Build DOM without innerHTML to satisfy Trusted Types CSP on strict host pages.
    const SVG = "http://www.w3.org/2000/svg";

    const card = document.createElement("div");
    card.className = "bs-card";

    if (isTest) {
      const dismissBtn = document.createElement("button");
      dismissBtn.className = "bs-dismiss-btn";
      dismissBtn.setAttribute("aria-label", "Dismiss");
      dismissBtn.textContent = "✕";
      card.appendChild(dismissBtn);
    }

    const emojiEl = document.createElement("div");
    emojiEl.className = "bs-emoji";
    emojiEl.textContent = safeTip.emoji;
    card.appendChild(emojiEl);

    const titleEl = document.createElement("h1");
    titleEl.className = "bs-title";
    titleEl.textContent = "Time to Breathe & Stretch";
    card.appendChild(titleEl);

    const tipEl = document.createElement("p");
    tipEl.className = "bs-tip";
    tipEl.textContent = safeTip.text;
    card.appendChild(tipEl);

    const ringWrap = document.createElement("div");
    ringWrap.className = "bs-timer-ring";

    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "bs-ring-svg");
    svg.setAttribute("aria-hidden", "true");
    const track = document.createElementNS(SVG, "circle");
    track.setAttribute("class", "bs-ring-track");
    track.setAttribute("cx", "50"); track.setAttribute("cy", "50"); track.setAttribute("r", "44");
    const progress = document.createElementNS(SVG, "circle");
    progress.setAttribute("class", "bs-ring-progress");
    progress.setAttribute("cx", "50"); progress.setAttribute("cy", "50"); progress.setAttribute("r", "44");
    svg.appendChild(track);
    svg.appendChild(progress);
    ringWrap.appendChild(svg);

    const countdownEl = document.createElement("span");
    countdownEl.className = "bs-countdown";
    countdownEl.setAttribute("aria-live", "polite");
    countdownEl.textContent = DURATION_SECONDS;
    ringWrap.appendChild(countdownEl);
    card.appendChild(ringWrap);

    const subtextEl = document.createElement("p");
    subtextEl.className = "bs-subtext";
    subtextEl.textContent = isTest ? "Preview mode · press any key to dismiss" : "Overlay closes automatically";
    card.appendChild(subtextEl);

    const audioBtn = document.createElement("button");
    audioBtn.className = "bs-audio-btn";
    audioBtn.setAttribute("aria-label", "Play calming bells");
    audioBtn.textContent = "🎵 Tap for bells";
    card.appendChild(audioBtn);

    overlay.appendChild(card);

    document.body.appendChild(overlay);
    overlay.focus();

    // Ring countdown
    const circumference = 2 * Math.PI * 44;
    progress.style.strokeDasharray  = circumference;
    progress.style.strokeDashoffset = 0;

    // Unique ID for this overlay instance — used by background to de-dupe BREAK_COMPLETED.
    const sessionId = Math.random().toString(36).slice(2);

    let remaining = DURATION_SECONDS;

    const interval = setInterval(() => {
      remaining -= 1;
      countdownEl.textContent = remaining;
      progress.style.strokeDashoffset = circumference * (1 - remaining / DURATION_SECONDS);
      if (remaining <= 0) {
        clearInterval(interval);
        // Only real, fully-elapsed breaks count toward the Zen Garden.
        if (!isTest) {
          chrome.runtime.sendMessage({ type: "BREAK_COMPLETED", sessionId }).catch(() => {});
        }
        dismissOverlay(overlay);
      }
    }, 1000);

    // Block only scroll/activation keys; let everything else (Cmd+R, Esc…) through.
    const INTERCEPT = new Set([" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const blockKeys = (e) => { if (INTERCEPT.has(e.key)) e.preventDefault(); };
    window.addEventListener("keydown", blockKeys, true);

    if (isTest) {
      const dismissBtn = card.querySelector(".bs-dismiss-btn");
      if (dismissBtn) dismissBtn.addEventListener("click", () => dismissOverlay(overlay));
    }

    const escHandler = isTest
      ? () => dismissOverlay(overlay)
      : null;
    if (escHandler) window.addEventListener("keydown", escHandler, true);

    overlay._cleanup = () => {
      window.removeEventListener("keydown", blockKeys, true);
      if (escHandler) window.removeEventListener("keydown", escHandler, true);
      clearInterval(interval);
    };

    setupAudio(audioEnabled, overlay);
  }

  // ─── Exports ─────────────────────────────────────────────────────────────────

  window.bsShowOverlay   = showOverlay;
  window.bsShowWarnToast = showWarnToast;
}
```

---

### File: content.js

```js
// Guard: register the runtime message listener only once per page.
// overlay.js (loaded before this) provides window.bsShowOverlay / bsShowWarnToast.
if (!window.__bsContentLoaded) {
  window.__bsContentLoaded = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SHOW_OVERLAY" && message.tip)
      window.bsShowOverlay?.(message.tip, message.audioEnabled, message.isTest);
    if (message.type === "SHOW_WARN_TOAST" && message.text)
      window.bsShowWarnToast?.(message.text);
  });
}
```

---

### File: popup.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      margin: 0;
      padding: 16px;
      width: 220px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    h2 {
      font-size: 14px;
      font-weight: 700;
      margin: 0 0 4px;
      color: #f1f5f9;
    }
    p {
      font-size: 12px;
      color: #64748b;
      margin: 0 0 14px;
      line-height: 1.4;
    }
    button {
      width: 100%;
      padding: 10px 0;
      border: none;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    #testBtn {
      background: #38bdf8;
      color: #0f172a;
    }
    #optionsBtn {
      background: #1e293b;
      color: #94a3b8;
      margin-top: 8px;
      border: 1px solid rgba(255,255,255,0.07);
    }
  </style>
</head>
<body>
  <h2>🧘 Breathe & Stretch</h2>
  <p id="statsLine" style="color:#38bdf8;font-weight:600;margin-bottom:4px;font-size:13px;"></p>
  <p>Next break in ~20 min.<br/>Or trigger one right now:</p>
  <button id="testBtn">Preview Break</button>
  <button id="optionsBtn">⚙ Customize &amp; Stats</button>
  <script src="popup.js"></script>
</body>
</html>
```

---

### File: popup.js

```js
document.getElementById("testBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TRIGGER_NOW", test: true });
  window.close();
});

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Show break count in popup
chrome.storage.sync.get({ breaksCompleted: 0 }, ({ breaksCompleted }) => {
  if (breaksCompleted > 0) {
    const STAGES = ["🌰","🌱","🌿","🌷","🌸","🌺"];
    const idx = [50,30,15,5,1,0].findIndex(t => breaksCompleted >= t);
    const flower = STAGES[Math.max(0, 5 - idx)];
    document.getElementById("statsLine").textContent =
      `${flower} ${breaksCompleted} break${breaksCompleted === 1 ? "" : "s"} completed`;
  }
});
```

---

### File: options.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Breathe & Stretch — Options</title>
  <link rel="stylesheet" href="options.css" />
  <link rel="stylesheet" href="overlay.css" />
</head>
<body>
  <div class="container">

    <div class="header">
      <h1>🧘 Breathe & Stretch</h1>
      <p>Make it yours. Every setting here helps build a calmer, healthier you.</p>
      <div class="next-break-bar">
        <span>Time until your next break</span>
        <div class="next-break-right">
          <span class="next-break-time" id="nextBreakTimer">—</span>
          <button id="testOverlayBtn">Preview</button>
        </div>
      </div>
    </div>

    <!-- ── Section 1: Zen Garden ───────────────────────────────────────── -->
    <div class="section-label">🌸 Your Zen Garden</div>
    <div class="zen-card">
      <div class="zen-flower-wrap">
        <span class="zen-flower" id="zenFlower">🌰</span>
      </div>
      <p class="zen-message" id="zenMessage">Complete your first break to plant a seed!</p>
      <div class="zen-stats">
        <div class="zen-stat">
          <span class="zen-number" id="breaksCount">0</span>
          <span class="zen-label">Breaks</span>
        </div>
        <div class="zen-divider">·</div>
        <div class="zen-stat">
          <span class="zen-number" id="minutesCount">0</span>
          <span class="zen-label">Mindful min</span>
        </div>
      </div>
    </div>

    <!-- ── Section 2: Extension Icon ──────────────────────────────────── -->
    <div class="section-label">✨ Extension Icon</div>
    <div class="icon-grid" id="iconGrid">
      <!-- injected by options.js -->
    </div>

    <!-- ── Section 3: Affirmations ────────────────────────────────────── -->
    <div class="section-label">💬 Your Affirmations</div>
    <div class="affirmations-card">
      <div class="affirmation-list" id="affirmationList"></div>
      <div class="affirmation-input-row">
        <textarea id="newAffirmation" placeholder="e.g. Smile — you're doing great."></textarea>
        <button id="addAffirmationBtn">Add</button>
      </div>
    </div>

    <!-- ── Section 4: Atmospheric Sound ──────────────────────────────── -->
    <div class="section-label">🔔 Atmospheric Sound</div>
    <div class="audio-card">
      <div class="audio-row">
        <div>
          <div class="audio-title">Tibetan Singing Bowl</div>
          <div class="hint">A soft synth bell tone plays 3 times during each break.</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="audioToggle" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>

    <!-- ── Section 5: Meeting Detection ───────────────────────────────── -->
    <div class="section-label">🤝 Meeting Detection</div>
    <div class="audio-card">
      <div class="audio-row">
        <div>
          <div class="audio-title">Scan all windows</div>
          <div class="hint">Check every open tab for Zoom, Meet, or Teams — not just the active window.</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="scanAllWindows" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>
    </div>

  </div>

  <div class="toast" id="toast">Saved!</div>
  <script src="overlay.js"></script>
  <script src="content.js"></script>
  <script src="options.js"></script>
</body>
</html>
```

---

### File: options.js

```js
// ─── Shared helpers ────────────────────────────────────────────────────────────

const ICON_OPTIONS = [
  { key: "meditator",  emoji: "🧘",   label: "Meditator ♀"},
  { key: "meditatorM", emoji: "🧘‍♂️",  label: "Meditator ♂"},
  { key: "bell",       emoji: "🔔",   label: "Bell"       },
  { key: "windchime",  emoji: "🎐",   label: "Wind Chime" },
  { key: "tea",        emoji: "🍵",   label: "Tea"        },
  { key: "leaf",       emoji: "🌿",   label: "Leaf"       },
  { key: "namaste",    emoji: "🙏",   label: "Namaste"    },
  { key: "wave",       emoji: "🌊",   label: "Wave"       },
];

let toastTimer;
function showToast(text = "Saved!") {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

// ─── Next Break Countdown + Test ──────────────────────────────────────────────

document.getElementById("testOverlayBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TRIGGER_NOW", test: true });
});

function updateNextBreakTimer() {
  chrome.alarms.get("breathe-stretch-alarm", (alarm) => {
    const el = document.getElementById("nextBreakTimer");
    if (!alarm) { el.textContent = "—"; return; }
    const mins = Math.ceil((alarm.scheduledTime - Date.now()) / 60000);
    el.textContent = mins > 0 ? `${mins} min` : "Any moment now";
  });
}

// ─── Section 1: Zen Garden ─────────────────────────────────────────────────────

const FLOWER_STAGES = [
  { min: 0,  emoji: "🌰", name: "Acorn",      message: "Complete your first break to plant a seed!" },
  { min: 1,  emoji: "🌱", name: "Sprout",     message: "A tiny sprout! You're just getting started. 🌱" },
  { min: 5,  emoji: "🌿", name: "Seedling",   message: "Your mindfulness practice is taking root. 🌿" },
  { min: 15, emoji: "🌷", name: "Bud",        message: "A bud appears! Beautiful consistency. 🌷" },
  { min: 30, emoji: "🌸", name: "Blossom",    message: "You're blossoming! This is a real habit now. 🌸" },
  { min: 50, emoji: "🌺", name: "Full Bloom", message: "Full bloom. You are a mindfulness master. 🌺" },
];

function getFlowerStage(breaks) {
  let stage = FLOWER_STAGES[0];
  for (const s of FLOWER_STAGES) {
    if (breaks >= s.min) stage = s;
  }
  return stage;
}

function loadZenGarden() {
  chrome.storage.sync.get({ breaksCompleted: 0, totalMindfulnessSeconds: 0 }, (data) => {
    const breaks  = data.breaksCompleted;
    const minutes = +(data.totalMindfulnessSeconds / 60).toFixed(1);
    const stage   = getFlowerStage(breaks);

    document.getElementById("breaksCount").textContent  = breaks;
    document.getElementById("minutesCount").textContent = minutes;

    const flowerEl = document.getElementById("zenFlower");
    flowerEl.textContent   = stage.emoji;
    flowerEl.dataset.stage = FLOWER_STAGES.indexOf(stage);

    document.getElementById("zenMessage").textContent = stage.message;
  });
}

// ─── Section 2: Icon Picker ────────────────────────────────────────────────────

function buildIconGrid(currentKey) {
  const grid = document.getElementById("iconGrid");
  grid.innerHTML = "";
  ICON_OPTIONS.forEach(({ key, emoji, label }) => {
    const card = document.createElement("div");
    card.className = "icon-card" + (key === currentKey ? " selected" : "");

    const check = document.createElement("span");
    check.className = "check";
    check.textContent = "✓";
    const emojiSpan = document.createElement("span");
    emojiSpan.className = "emoji";
    emojiSpan.textContent = emoji;
    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = label;
    card.appendChild(check);
    card.appendChild(emojiSpan);
    card.appendChild(nameSpan);
    card.addEventListener("click", () => {
      document.querySelectorAll(".icon-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      chrome.storage.sync.set({ iconChoice: key });
      chrome.runtime.sendMessage({ type: "SET_ICON", choice: key });
      showToast("Icon updated! ✓");
    });
    grid.appendChild(card);
  });
}

// ─── Section 3: Custom Affirmations ───────────────────────────────────────────

function getAffirmations() {
  return new Promise(resolve => {
    chrome.storage.sync.get({ customTips: "" }, ({ customTips }) => {
      resolve(customTips.split("\n").map(t => t.trim()).filter(Boolean));
    });
  });
}

function saveAffirmations(list) {
  return new Promise(resolve => {
    chrome.storage.sync.set({ customTips: list.join("\n") }, resolve);
  });
}

function renderAffirmations(list) {
  const container = document.getElementById("affirmationList");
  if (list.length === 0) {
    container.innerHTML = '<p class="affirmation-empty">No affirmations yet — add your first below.</p>';
    return;
  }
  container.innerHTML = "";
  list.forEach((text, i) => {
    const item = document.createElement("div");
    item.className = "affirmation-item";

    const span = document.createElement("span");
    span.className = "affirmation-text";
    span.textContent = text;

    const btn = document.createElement("button");
    btn.className = "affirmation-delete";
    btn.setAttribute("aria-label", "Delete affirmation");
    btn.textContent = "×";
    btn.addEventListener("click", async () => {
      const current = await getAffirmations();
      current.splice(i, 1);
      await saveAffirmations(current);
      renderAffirmations(current);
      showToast("Affirmation removed");
    });

    item.appendChild(span);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

async function loadAffirmations() {
  renderAffirmations(await getAffirmations());
}

document.getElementById("addAffirmationBtn").addEventListener("click", async () => {
  const input = document.getElementById("newAffirmation");
  const lines = input.value.split("\n").map(t => t.trim()).filter(Boolean);
  if (!lines.length) return;
  const current = await getAffirmations();
  const merged  = [...current, ...lines];
  await saveAffirmations(merged);
  renderAffirmations(merged);
  input.value = "";
  showToast(`Affirmation${lines.length > 1 ? "s" : ""} saved! ✨`);
});

// ─── Section 4: Audio Toggle ───────────────────────────────────────────────────

function loadAudioToggle() {
  chrome.storage.sync.get({ audioEnabled: false }, ({ audioEnabled }) => {
    document.getElementById("audioToggle").checked = audioEnabled;
  });
}

document.getElementById("audioToggle").addEventListener("change", (e) => {
  chrome.storage.sync.set({ audioEnabled: e.target.checked });
  showToast(e.target.checked ? "Sound enabled 🔔" : "Sound off 🔇");
});

// ─── Section 5: Meeting Detection Toggle ───────────────────────────────────────

function loadMeetingToggle() {
  chrome.storage.sync.get({ scanAllWindows: true }, ({ scanAllWindows }) => {
    document.getElementById("scanAllWindows").checked = scanAllWindows;
  });
}

document.getElementById("scanAllWindows").addEventListener("change", (e) => {
  chrome.storage.sync.set({ scanAllWindows: e.target.checked });
  showToast(e.target.checked ? "Scanning all windows 🤝" : "Active window only");
});

// ─── Init ──────────────────────────────────────────────────────────────────────

chrome.storage.sync.get({ iconChoice: "meditator" }, ({ iconChoice }) => {
  buildIconGrid(iconChoice);
});

updateNextBreakTimer();
setInterval(updateNextBreakTimer, 30000);

loadZenGarden();
loadAffirmations();
loadAudioToggle();
loadMeetingToggle();
```

---

### File: options.css

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 60px 20px;
}

.container {
  width: 100%;
  max-width: 560px;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */

.header {
  margin-bottom: 40px;
}
.header h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #f1f5f9;
  margin-bottom: 6px;
}
.header p {
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 16px;
}

/* ── Next Break Countdown ────────────────────────────────────────────────────── */

.next-break-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 14px;
  padding: 13px 20px;
  font-size: 14px;
  color: #64748b;
}
.next-break-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.next-break-time {
  font-size: 16px;
  font-weight: 800;
  color: #38bdf8;
  letter-spacing: -0.5px;
}
.next-break-bar button {
  background: transparent;
  color: #475569;
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.next-break-bar button:hover { color: #38bdf8; border-color: #38bdf8; }

/* ── Section label ───────────────────────────────────────────────────────────── */

.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #475569;
  margin-bottom: 12px;
}

/* ── Shared hint text ────────────────────────────────────────────────────────── */

.hint {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}

/* ── Zen Garden ──────────────────────────────────────────────────────────────── */

.zen-card {
  background: linear-gradient(145deg, #1e293b, #162032);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  padding: 32px 24px 24px;
  text-align: center;
  margin-bottom: 36px;
}

.zen-flower-wrap {
  margin-bottom: 16px;
  height: 108px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  user-select: none;
  pointer-events: none;
}

.zen-flower {
  display: inline-block;
  font-size: 88px;
  line-height: 1;
  animation: zen-sway 5s ease-in-out infinite;
  transition: font-size 0.6s ease, filter 0.6s ease;
}
.zen-flower[data-stage="0"] { font-size: 44px; filter: grayscale(0.4); }
.zen-flower[data-stage="1"] { font-size: 54px; }
.zen-flower[data-stage="2"] { font-size: 66px; }
.zen-flower[data-stage="3"] { font-size: 76px; }
.zen-flower[data-stage="4"] { font-size: 84px; }
.zen-flower[data-stage="5"] { font-size: 92px; filter: drop-shadow(0 0 18px rgba(250, 204, 21, 0.45)); }

@keyframes zen-sway {
  0%, 100% { transform: rotate(-3deg); }
  50%       { transform: rotate(3deg);  }
}

.zen-message {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 16px;
}

.zen-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  user-select: none;
}
.zen-stat { text-align: center; }
.zen-number {
  display: block;
  font-size: 34px;
  font-weight: 800;
  color: #38bdf8;
  line-height: 1;
  letter-spacing: -1px;
}
.zen-label {
  font-size: 11px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.zen-divider { font-size: 28px; color: #1e3a5f; }

/* ── Icon picker grid ────────────────────────────────────────────────────────── */

.icon-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 36px;
}

.icon-card {
  position: relative;
  background: #1e293b;
  border: 2px solid transparent;
  border-radius: 16px;
  padding: 20px 8px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, transform 0.15s;
  user-select: none;
}
.icon-card:hover { background: #253347; transform: translateY(-2px); }
.icon-card.selected { border-color: #38bdf8; background: #0c2233; }

.icon-card .emoji { font-size: 40px; line-height: 1; display: block; margin-bottom: 10px; }
.icon-card .name  { font-size: 12px; font-weight: 600; color: #94a3b8; }
.icon-card.selected .name { color: #38bdf8; }

.icon-card .check {
  display: none;
  position: absolute;
  top: 8px; right: 8px;
  width: 18px; height: 18px;
  background: #38bdf8;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #0f172a;
  font-weight: 900;
}
.icon-card.selected .check { display: flex; }

/* ── Affirmations ────────────────────────────────────────────────────────────── */

.affirmations-card {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 36px;
}

.affirmation-list { margin-bottom: 0; }

.affirmation-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.affirmation-text {
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.5;
}

.affirmation-delete {
  flex-shrink: 0;
  background: none;
  border: none;
  color: #334155;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 6px;
  transition: color 0.15s;
}
.affirmation-delete:hover { color: #ef4444; }

.affirmation-empty {
  font-size: 13px;
  color: #334155;
  text-align: center;
  padding: 8px 0 16px;
}

.affirmation-input-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 16px;
  margin-top: 4px;
}

.affirmation-input-row textarea {
  flex: 1;
  min-height: 66px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #e2e8f0;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  padding: 10px 14px;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
}
.affirmation-input-row textarea:focus { border-color: #38bdf8; }
.affirmation-input-row textarea::placeholder { color: #2d3f55; }

.affirmation-input-row button {
  flex-shrink: 0;
  background: #0c2233;
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  padding: 9px 22px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  align-self: flex-end;
}
.affirmation-input-row button:hover { background: #1e3a5f; }

/* ── Audio toggle card ───────────────────────────────────────────────────────── */

.audio-card {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  padding: 22px 24px;
  margin-bottom: 36px;
}
.audio-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.audio-title {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 4px;
}

/* Toggle switch */
.toggle { position: relative; display: inline-block; flex-shrink: 0; }
.toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle-track {
  display: block;
  width: 46px;
  height: 26px;
  background: #334155;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}
.toggle input:checked ~ .toggle-track { background: #38bdf8; }
.toggle-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 20px; height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.toggle input:checked ~ .toggle-track .toggle-thumb { transform: translateX(20px); }

/* ── Toast ───────────────────────────────────────────────────────────────────── */

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(16px);
  background: #1e293b;
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 22px;
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s, transform 0.25s;
  white-space: nowrap;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

---

### File: overlay.css

```css
/* ============================================================
   Breathe & Stretch — Overlay Styles
   All selectors are prefixed with "bs-" to avoid collisions.
   ============================================================ */

#breathe-stretch-overlay {
  /* Cover everything */
  position: fixed;
  inset: 0;
  z-index: 2147483647; /* max z-index */

  /* Frosted glass backdrop */
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);

  /* Block ALL interaction with the underlying page */
  pointer-events: all;

  /* Layout */
  display: flex;
  align-items: center;
  justify-content: center;

  /* Entrance animation */
  animation: bs-fade-in 0.4s ease both;

  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
}

/* Fade-out class toggled by JS before removal */
#breathe-stretch-overlay.bs-fade-out {
  animation: bs-fade-out 0.4s ease both;
}

/* ---------- Card ---------- */
.bs-card {
  position: relative;
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
  padding: 48px 56px;
  max-width: 480px;
  width: 90vw;
  text-align: center;
  color: #f1f5f9;
}

/* ---------- Test-mode dismiss button ---------- */
.bs-dismiss-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  pointer-events: all;
}
.bs-dismiss-btn:hover { background: rgba(255, 255, 255, 0.12); color: #e2e8f0; }

/* ---------- Emoji ---------- */
.bs-emoji {
  font-size: 64px;
  line-height: 1;
  margin-bottom: 16px;
  /* Gentle float */
  animation: bs-float 3s ease-in-out infinite;
}

/* ---------- Title ---------- */
.bs-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #e2e8f0;
  margin: 0 0 12px;
}

/* ---------- Tip text ---------- */
.bs-tip {
  font-size: 18px;
  font-weight: 400;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0 0 32px;
}

/* ---------- Ring timer ---------- */
.bs-timer-ring {
  position: relative;
  width: 100px;
  height: 100px;
  margin: 0 auto 20px;
}

.bs-ring-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg); /* start from top */
}

.bs-ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 6;
}

.bs-ring-progress {
  fill: none;
  stroke: #38bdf8; /* sky-400 */
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear;
}

.bs-countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: #f1f5f9;
}

/* ---------- Sub-text ---------- */
.bs-subtext {
  font-size: 13px;
  color: rgba(148, 163, 184, 0.5);
  margin: 0;
  letter-spacing: 0.3px;
}

/* ---------- Audio button (shown only when autoplay is blocked) ---------- */
.bs-audio-btn {
  display: none; /* shown via JS when needed */
  margin: 16px auto 0;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 999px;
  color: #38bdf8;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 18px;
  cursor: pointer;
  align-items: center;
  gap: 6px;
  pointer-events: all;
  transition: background 0.15s;
}
.bs-audio-btn:hover { background: rgba(56, 189, 248, 0.2); }

/* ---------- Warning toast (non-blocking, bottom of screen) ---------- */
#bs-warn-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(14px);
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(56, 189, 248, 0.18);
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 22px;
  border-radius: 999px;
  z-index: 2147483646; /* one below the overlay */
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
#bs-warn-toast.bs-warn-toast-show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ============================================================
   Keyframes
   ============================================================ */

@keyframes bs-fade-in {
  from { opacity: 0; transform: scale(0.97); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes bs-fade-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.97); }
}

@keyframes bs-float {
  0%, 100% { transform: translateY(0);    }
  50%       { transform: translateY(-8px); }
}
```

---

### File: break.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Breathe & Stretch</title>
  <style>
    html, body { margin: 0; padding: 0; background: #0f172a; width: 100vw; height: 100vh; }
  </style>
  <link rel="stylesheet" href="overlay.css" />
</head>
<body>
  <script src="overlay.js"></script>
  <script src="break.js"></script>
</body>
</html>
```

---

### File: break.js

```js
// Reads the pending overlay payload stashed by the background service worker,
// shows the overlay via the shared overlay.js module, then closes this tab
// automatically when the overlay finishes (real or dismissed).

function closeThisTab() {
  chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
}

async function popPendingOverlay() {
  // Try session storage first (ephemeral, cleared on browser restart).
  // Fall back to local storage for Chrome < 102 where session storage is absent.
  let result, store;
  try {
    result = await chrome.storage.session.get("pendingOverlay");
    store  = chrome.storage.session;
  } catch {
    result = await chrome.storage.local.get("pendingOverlay");
    store  = chrome.storage.local;
  }

  const data = result?.pendingOverlay;

  // Clear immediately — before any early returns — to prevent the same payload
  // from being consumed a second time if break.html is somehow opened again.
  store.remove("pendingOverlay").catch(() => {});

  // No payload: nothing to show.
  if (!data || !data.tip) return null;

  // Stale payload: discard if older than 2 minutes.
  if (Date.now() - data.createdAt > 120_000) return null;

  return data;
}

(async () => {
  const data = await popPendingOverlay();

  if (!data) {
    // Nothing valid to display — close this tab silently.
    closeThisTab();
    return;
  }

  if (!window.bsShowOverlay) return;

  window.bsShowOverlay(data.tip, data.audioEnabled, data.isTest);

  // Close this tab once the overlay fires its dismissal event.
  window.addEventListener("bs:overlayClosed", closeThisTab, { once: true });
})();
```
