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
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Health break");

    overlay.innerHTML = `
      <div class="bs-card">
        ${isTest ? '<button class="bs-dismiss-btn" aria-label="Dismiss">✕</button>' : ""}
        <div class="bs-emoji"></div>
        <h1 class="bs-title">Time to Breathe &amp; Stretch</h1>
        <p class="bs-tip"></p>
        <div class="bs-timer-ring">
          <svg viewBox="0 0 100 100" class="bs-ring-svg" aria-hidden="true">
            <circle class="bs-ring-track" cx="50" cy="50" r="44"/>
            <circle class="bs-ring-progress" cx="50" cy="50" r="44"/>
          </svg>
          <span class="bs-countdown" aria-live="polite">${DURATION_SECONDS}</span>
        </div>
        <p class="bs-subtext">${isTest ? "Preview mode · press any key to dismiss" : "Overlay closes automatically"}</p>
        <button class="bs-audio-btn" aria-label="Play calming bells">🎵 Tap for bells</button>
      </div>
    `;
    // Set user-controlled text via textContent (prevents XSS)
    overlay.querySelector(".bs-emoji").textContent = tip.emoji;
    overlay.querySelector(".bs-tip").textContent   = tip.text;

    document.body.appendChild(overlay);
    overlay.focus();

    // Ring countdown
    const circle        = overlay.querySelector(".bs-ring-progress");
    const circumference = 2 * Math.PI * 44;
    circle.style.strokeDasharray  = circumference;
    circle.style.strokeDashoffset = 0;

    const countdownEl = overlay.querySelector(".bs-countdown");
    let remaining = DURATION_SECONDS;

    const interval = setInterval(() => {
      remaining -= 1;
      countdownEl.textContent = remaining;
      circle.style.strokeDashoffset = circumference * (1 - remaining / DURATION_SECONDS);
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
      const dismissBtn = overlay.querySelector(".bs-dismiss-btn");
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
