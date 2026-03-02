// Reads the pending overlay payload stashed by the background service worker,
// shows the overlay via the shared overlay.js module, then closes this tab
// automatically when the overlay finishes (real or dismissed).

async function popPendingOverlay() {
  // Prefer session storage (cleared on browser restart, not synced).
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
  store.remove("pendingOverlay").catch(() => {});          // clear immediately
  if (!data) return null;
  if (Date.now() - data.createdAt > 120_000) return null;  // 2-minute TTL
  return data;
}

(async () => {
  const data = await popPendingOverlay();
  if (!data || !data.tip || !window.bsShowOverlay) return;

  window.bsShowOverlay(data.tip, data.audioEnabled, data.isTest);

  // Close this tab once the overlay fires its dismissal event.
  window.addEventListener("bs:overlayClosed", () => {
    chrome.tabs.getCurrent(tab => { if (tab) chrome.tabs.remove(tab.id); });
  }, { once: true });
})();
