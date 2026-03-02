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
