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
  // 1. Try the last focused normal window first
  if (_lastNormalWindowId !== null) {
    const tabs = await new Promise(r =>
      chrome.tabs.query({ active: true, windowId: _lastNormalWindowId }, r)
    );
    if (tabs?.length > 0 && isExecutableTab(tabs[0])) return tabs[0];
  }

  // 2. Try any normal window with an executable active tab
  const allTabs = await new Promise(r =>
    chrome.tabs.query({ active: true, windowType: 'normal' }, r)
  );
  for (const tab of (allTabs || [])) {
    if (isExecutableTab(tab)) return tab;
  }

  // 3. No executable tab found (e.g. user is on chrome://extensions, devtools, etc.)
  //    Return null — NEVER auto-create a window. The caller must handle this.
  return null;
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