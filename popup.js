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
