// =============================================================================
// background/window.js
// Tracks the last focused normal window (for execution target)
// and manages the single popup window instance.
// =============================================================================

let _popupWindowId      = null;
let _lastNormalWindowId = null;

// Track last focused normal window   this is where commands execute
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError) return;
    if (win.type === 'normal') _lastNormalWindowId = windowId;
  });
});

// Open popup on toolbar icon click   only one instance at a time
chrome.action.onClicked.addListener(() => {
  if (_popupWindowId !== null) {
    chrome.windows.get(_popupWindowId, (win) => {
      if (chrome.runtime.lastError || !win) {
        _popupWindowId = null;
        openPopup();
      } else {
        chrome.windows.update(_popupWindowId, { focused: true });
      }
    });
  } else {
    openPopup();
  }
});

function openPopup() {
  chrome.windows.create({
    url: 'voice.html',
    type: 'popup',
    width: 420,
    height: 560
  }, (win) => {
    _popupWindowId = win.id;
  });
}

// Clean up reference when popup is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === _popupWindowId) _popupWindowId = null;
});
