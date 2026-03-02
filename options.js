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
    card.innerHTML = `<span class="check">✓</span><span class="emoji">${emoji}</span><span class="name">${label}</span>`;
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
