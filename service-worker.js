chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

/* Set for initial active tab when open the sidepanel */
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  //  setActiveURL(tab.url);
})();

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.active) {
    console.log("======= active tab url", tab.url);
    // setActiveURL(tab.url);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.active) {
    console.log("======= active tab url", tab.url);
    // setActiveURL(tab.url);
  }
});
