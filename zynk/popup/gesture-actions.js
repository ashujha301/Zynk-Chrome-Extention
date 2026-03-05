// =============================================================================
// popup/gesture-actions.js
// All gesture side-effects: scroll control, tab switcher state machine,
// overlay messaging, debounce utility, sendToTab helper.
//
// Depends on: ui.js (gestureLabel, gesturePill)
// =============================================================================

// -- Scroll state -------------------------------------------------------------
let scrollDir        = 0;          // current direction: 'up', 'down', or 0
const SCROLL_PX      = 110;        // pixels per tick
const SCROLL_MS      = 55;         // ms between ticks

// -- Tab switcher state -------------------------------------------------------
// Flow: idle -> browsing (open hand) -> selecting (fist + move) -> idle
let tabMode          = 'idle';     // 'idle' | 'browsing' | 'selecting'
let tabList          = [];         // [{id, title, url, index}]
let tabHighlight     = 0;          // currently highlighted tab index
let tabFistXSmooth   = 0.5;        // EMA-smoothed wrist X during fist nav
let tabFistXPrev     = 0.5;        // previous X to measure delta
const TAB_SMOOTH     = 0.18;       // EMA factor for fist X
const TAB_STEP_DIST  = 0.07;       // wrist travel needed to move one tab

// -- Gesture debounce ---------------------------------------------------------
const GESTURE_COOLDOWN = 900;      // ms
const _debounceTimes   = {};

function debounce(key, fn, cooldown) {
  cooldown = (cooldown !== undefined) ? cooldown : GESTURE_COOLDOWN;
  const now = Date.now();
  if (now - (_debounceTimes[key] || 0) < cooldown) return;
  _debounceTimes[key] = now;
  fn();
}

// =============================================================================
// SCROLL
// Sends a single GESTURE_SCROLL_START to background which injects a
// setInterval directly into the page   no per-tick round-trips.
// =============================================================================
function startScroll(dir) {
  if (scrollDir === dir) return;
  stopScroll();
  scrollDir = dir;
  sendToTab({ type: 'GESTURE_SCROLL_START', dir, px: SCROLL_PX, ms: SCROLL_MS });
}

function stopScroll() {
  if (!scrollDir) return;
  scrollDir = 0;
  sendToTab({ type: 'GESTURE_SCROLL_STOP' });
}

// =============================================================================
// TAB SWITCHER STATE MACHINE
// Called from gesture-detection.js processFrame every frame.
// Returns true if the tab switcher consumed this frame (caller should return).
// =============================================================================
function handleTabSwitcher(lm, f, pinch, pointing, openHand, isFist) {

  if (tabMode === 'idle') {
    if (!openHand) return false; // nothing to do

    // STEP 1: open hand seen -> enter browsing mode
    stopScroll();
    tabMode        = 'browsing';
    tabFistXSmooth = 1 - lm[0].x;
    tabFistXPrev   = tabFistXSmooth;

    chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'get_tabs' }, (resp) => {
      if (resp && resp.tabs) {
        tabList      = resp.tabs;
        tabHighlight = resp.activeIndex || 0;
        showTabOverlay(tabList, tabHighlight);
      }
    });
    gestureLabel.textContent = 'TABS: close fist to browse';
    return true;
  }

  if (tabMode === 'browsing') {
    if (openHand) {
      gestureLabel.textContent = 'TABS: close fist to browse';
      stopScroll();
      return true;
    }
    if (isFist) {
      // STEP 2: fist -> start navigating
      tabMode        = 'selecting';
      tabFistXSmooth = 1 - lm[0].x;
      tabFistXPrev   = tabFistXSmooth;
      gestureLabel.textContent = 'TABS: move fist left / right';
      stopScroll();
      return true;
    }
    // Any other gesture cancels
    exitTabMode();
    return false;
  }

  if (tabMode === 'selecting') {
    if (isFist) {
      // Track wrist X (flipped for mirror) to navigate
      const rawX = 1 - lm[0].x;
      tabFistXSmooth += (rawX - tabFistXSmooth) * TAB_SMOOTH;
      const delta = tabFistXSmooth - tabFistXPrev;

      if (delta > TAB_STEP_DIST && tabHighlight < tabList.length - 1) {
        tabHighlight++;
        tabFistXPrev = tabFistXSmooth;
        updateTabOverlay(tabHighlight);
      } else if (delta < -TAB_STEP_DIST && tabHighlight > 0) {
        tabHighlight--;
        tabFistXPrev = tabFistXSmooth;
        updateTabOverlay(tabHighlight);
      }

      gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + ' / ' + tabList.length + '  (open hand = select)';
      stopScroll();
      return true;
    }

    if (openHand) {
      // STEP 3: open hand -> CONFIRM selection
      const t = tabList[tabHighlight];
      if (t) {
        chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'switch_tab', tabId: t.id });
        showGestureFeedback('TAB ' + (tabHighlight + 1));
      }
      exitTabMode();
      return true;
    }

    if (pointing) {
      // One-finger point = cancel
      exitTabMode();
      return false; // let cursor mode take over
    }

    // Any other unrecognised pose: stay in selecting (avoid accidental exit)
    gestureLabel.textContent = 'TAB ' + (tabHighlight + 1) + ' / ' + tabList.length;
    stopScroll();
    return true;
  }

  return false;
}

// =============================================================================
// TAB OVERLAY MESSAGING
// =============================================================================
function showTabOverlay(tabs, activeIdx) {
  chrome.runtime.sendMessage({
    type: 'TAB_OVERLAY', action: 'show',
    tabs, activeIdx
  });
}

function updateTabOverlay(activeIdx) {
  chrome.runtime.sendMessage({
    type: 'TAB_OVERLAY', action: 'update',
    tabs: tabList, activeIdx
  });
}

function exitTabMode() {
  tabMode  = 'idle';
  tabList  = [];
  chrome.runtime.sendMessage({ type: 'TAB_OVERLAY', action: 'hide' });
  gestureLabel.textContent = 'Hand detected';
}

// =============================================================================
// GESTURE FEEDBACK (pill animation)
// =============================================================================
function showGestureFeedback(label) {
  gesturePill.textContent = label;
  gesturePill.classList.add('triggered');
  setTimeout(() => {
    gesturePill.classList.remove('triggered');
    gesturePill.textContent = 'ACTIVE';
  }, 800);
}

// =============================================================================
// SEND TO TAB
// Wraps all gesture payloads into GESTURE_TO_TAB for background.js routing.
// =============================================================================
function sendToTab(msg) {
  chrome.runtime.sendMessage({ type: 'GESTURE_TO_TAB', payload: msg });
}
