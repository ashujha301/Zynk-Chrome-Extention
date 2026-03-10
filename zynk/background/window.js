// background/window.js
// Tracks the last focused normal window (for execution target)
// and manages the single popup window instance.
//
// WIDTH is fixed at 400px (matches body width in voice.html).
// HEIGHT starts at 260px (collapsed — no camera panel).
// When the user opens the camera panel, the popup JS calls
// RESIZE_POPUP to grow the window to fit.  This keeps the window
// tight with no dead space on Mac fullscreen or any screen size.

let _popupWindowId      = null;
let _lastNormalWindowId = null;

const POPUP_WIDTH          = 400;
// Heights account for OS chrome (titlebar):
//   Windows: ~32px titlebar
//   Mac:     ~52px titlebar (bigger traffic-light buttons)
// We detect platform and add the right offset.
const _isMac = navigator?.platform?.toLowerCase().includes('mac') ||
               navigator?.userAgentData?.platform?.toLowerCase().includes('mac') || false;
const _titlebarOffset      = _isMac ? 52 : 32;

const POPUP_HEIGHT_CLOSED  = 260 + _titlebarOffset;
const POPUP_HEIGHT_OPEN    = 740 + _titlebarOffset;

// Track last focused normal window — this is where commands execute
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError) return;
    if (win.type === 'normal') _lastNormalWindowId = windowId;
  });
});

// Open popup on toolbar icon click — only one instance at a time
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
    url:    'voice.html',
    type:   'popup',
    width:  POPUP_WIDTH,
    height: POPUP_HEIGHT_CLOSED,
    focused: true,
  }, (win) => {
    _popupWindowId = win.id;
  });
}

// Called by the popup JS (camera.js) when gesture panel opens or closes
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'RESIZE_POPUP') return;
  if (_popupWindowId === null) return;
  chrome.windows.update(_popupWindowId, {
    width:  POPUP_WIDTH,
    height: message.open ? POPUP_HEIGHT_OPEN : POPUP_HEIGHT_CLOSED,
  });
});

// Clean up reference when popup is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === _popupWindowId) _popupWindowId = null;
});