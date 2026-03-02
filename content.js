// Guard: register the runtime message listener only once per page.
// overlay.js (loaded before this) provides window.bsShowOverlay / bsShowWarnToast.
if (!window.__bsContentLoaded) {
  window.__bsContentLoaded = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SHOW_OVERLAY" && message.tip)
      window.bsShowOverlay(message.tip, message.audioEnabled, message.isTest);
    if (message.type === "SHOW_WARN_TOAST" && message.text)
      window.bsShowWarnToast(message.text);
  });
}
