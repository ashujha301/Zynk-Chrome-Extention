// =============================================================================
// background/tabs.js
// Tab utilities: find the right execution target, wait for page load.
// Depends on: window.js (_lastNormalWindowId)
// =============================================================================

// Returns the best tab to execute in:
//   1. Active tab in last focused normal window
//   2. Active tab in any normal window
//   3. A new window (fallback)
async function getRealTab() {
  if (_lastNormalWindowId !== null) {
    const tabs = await new Promise(r =>
      chrome.tabs.query({ active: true, windowId: _lastNormalWindowId }, r)
    );
    if (tabs?.length > 0 && isExecutableTab(tabs[0])) return tabs[0];
  }

  const allTabs = await new Promise(r =>
    chrome.tabs.query({ active: true, windowType: 'normal' }, r)
  );
  for (const tab of (allTabs || [])) {
    if (isExecutableTab(tab)) return tab;
  }

  // Last resort: open a new window
  const win = await chrome.windows.create({ url: 'about:blank', type: 'normal' });
  _lastNormalWindowId = win.id;
  return win.tabs[0];
}

// Chrome blocks scripting on these URL schemes
function isExecutableTab(tab) {
  if (!tab?.url) return false;
  return !tab.url.startsWith('chrome://') &&
         !tab.url.startsWith('chrome-extension://') &&
         !tab.url.startsWith('devtools://');
}

// Resolves when the tab finishes loading (or times out)
function waitForTabLoad(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
