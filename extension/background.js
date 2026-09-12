/**
 * PMPilot Extension Background Service Worker
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("[PMPilot] Chrome Extension installed and active.");
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      // Sync active tab URL to local extension storage
      chrome.storage.local.set({ lastActiveUrl: tab.url, lastActiveTitle: tab.title });
    }
  } catch (err) {
    // Ignore non-standard tabs
  }
});
