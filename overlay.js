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
    overlay.addEventListener("animationend", () => {
      overlay.remove();
      window.dispatchEvent(new Event("bs:overlayClosed"));
    }, { once: true });
  }

  function showOverlay(tip, audioEnabled, isTest = false) {
    if (!tip?.emoji) return;
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
    emojiEl.textContent = tip.emoji;
    card.appendChild(emojiEl);

    const titleEl = document.createElement("h1");
    titleEl.className = "bs-title";
    titleEl.textContent = "Time to Breathe & Stretch";
    card.appendChild(titleEl);

    const tipEl = document.createElement("p");
    tipEl.className = "bs-tip";
    tipEl.textContent = tip.text;
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

    let remaining = DURATION_SECONDS;

    const interval = setInterval(() => {
      remaining -= 1;
      countdownEl.textContent = remaining;
      progress.style.strokeDashoffset = circumference * (1 - remaining / DURATION_SECONDS);
      if (remaining <= 0) {
        clearInterval(interval);
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
