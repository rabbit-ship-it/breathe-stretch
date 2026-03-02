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

  // Increment stats only for real breaks
  if (!isTest) {
    const { breaksCompleted = 0, totalMindfulnessSeconds = 0 } =
      await chrome.storage.sync.get({ breaksCompleted: 0, totalMindfulnessSeconds: 0 });
    chrome.storage.sync.set({
      breaksCompleted: breaksCompleted + 1,
      totalMindfulnessSeconds: totalMindfulnessSeconds + 30
    });
  }
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
});
