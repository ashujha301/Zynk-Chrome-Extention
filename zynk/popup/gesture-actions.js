// =============================================================================
// popup/gesture-actions.js
//
// TAB SWITCHER - Palm absolute position tracking:
//   When palm appears, record palmRefX (where palm center is now).
//   Every frame: measure palmCurrentX - palmRefX.
//   If drift > TAB_STEP_DIST -> step one tab in that direction.
//   After each step: palmRefX = palmCurrentX (reset reference to HERE).
//   This means: keep sliding right -> keeps stepping right tab by tab.
//               slide left -> steps left tab by tab.
//   No lock/unlock complexity. Very responsive. Slight shift = one tab.
//
// Palm center = average X of all 4 finger MCPs (lm 5,9,13,17).
// More stable than wrist alone, less twitchy than finger tips.
// =============================================================================

// -- Scroll -------------------------------------------------------------------
let scrollDir        = 0;
const SCROLL_PX_SLOW = 5;
const SCROLL_MS_SLOW = 16;

// -- Debounce -----------------------------------------------------------------
const GESTURE_COOLDOWN = 900;
const _debounceTimes   = {};

function debounce(key, fn, cooldown) {
  cooldown = (cooldown !== undefined) ? cooldown : GESTURE_COOLDOWN;
  const now = Date.now();
  if (now - (_debounceTimes[key] || 0) < cooldown) return;
  _debounceTimes[key] = now;
  fn();
}

// -- Scroll -------------------------------------------------------------------
function startScrollSlow(dir) {
  if (scrollDir === dir) return;
  stopScroll();
  scrollDir = dir;
  sendToTab({ type: 'GESTURE_SCROLL_START', dir, px: SCROLL_PX_SLOW, ms: SCROLL_MS_SLOW });
}

function stopScroll() {
  if (!scrollDir) return;
  scrollDir = 0;
  sendToTab({ type: 'GESTURE_SCROLL_STOP' });
}

// -- Tab switcher state -------------------------------------------------------
let tabMode      = 'idle';
let tabList      = [];
let tabHighlight = 0;

// Palm position tracking
let palmRefX     = 0.5;   // palm center X when palm started / after each step
let palmSmoothed = 0.5;   // EMA-smoothed palm center X

// TAB_STEP_DIST: how far palm must drift from palmRefX to trigger one tab step.
// 0.05 = 5% of normalised frame width. Roughly 3-4cm movement at arm's length.
// Small enough for easy control, large enough to avoid accidental triggers.
const TAB_STEP_DIST = 0.05;
const PALM_SMOOTH   = 0.30; // EMA factor - higher = more responsive

// Get palm center X: average of the 4 finger MCP landmarks.
// Mirrored (1 - x) because camera is flipped.
function getPalmCenterX(lm) {
  const avg = (lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 4;
  return 1 - avg; // mirror
}

// =============================================================================
// TAB SWITCHER STATE MACHINE
// Returns true if tab mode consumed this frame.
// =============================================================================
function handleTabSwitcher(lm, f, openPalm, isFist) {

  // ---- IDLE ---------------------------------------------------------------
  if (tabMode === 'idle') {
    if (!openPalm) return false;

    tabMode      = 'browsing';
    palmSmoothed = getPalmCenterX(lm);
    palmRefX     = palmSmoothed;

    chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'get_tabs' }, (resp) => {
      if (resp && resp.tabs) {
        tabList      = resp.tabs;
        tabHighlight = resp.activeIndex || 0;
        showTabOverlay(tabList, tabHighlight);
      }
    });
    gestureLabel.textContent = 'TABS: slide palm L/R   fist = open';
    return true;
  }

  // ---- BROWSING -----------------------------------------------------------
  if (tabMode === 'browsing') {

    // Fist = open current highlighted tab
    if (isFist) {
      const t = tabList[tabHighlight];
      if (t) {
        chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'switch_tab', tabId: t.id });
        showGestureFeedback('TAB ' + (tabHighlight + 1));
      }
      exitTabMode();
      return true;
    }

    if (openPalm) {
      // Smooth the palm center position
      const raw     = getPalmCenterX(lm);
      palmSmoothed += (raw - palmSmoothed) * PALM_SMOOTH;

      // How far has palm moved from reference point?
      const drift = palmSmoothed - palmRefX;

      if (drift > TAB_STEP_DIST) {
        // Palm moved RIGHT -> next tab
        if (tabHighlight < tabList.length - 1) {
          tabHighlight++;
          updateTabOverlay(tabHighlight);
        }
        // Reset reference to current position so next step needs another drift
        palmRefX = palmSmoothed;

      } else if (drift < -TAB_STEP_DIST) {
        // Palm moved LEFT -> previous tab
        if (tabHighlight > 0) {
          tabHighlight--;
          updateTabOverlay(tabHighlight);
        }
        palmRefX = palmSmoothed;
      }

      gestureLabel.textContent =
        'TAB ' + (tabHighlight + 1) + ' / ' + tabList.length + '   fist = open';
      return true;
    }

    // Not palm, not fist = cancel tab mode
    exitTabMode();
    return false;
  }

  return false;
}

// =============================================================================
// TAB OVERLAY MESSAGING
// =============================================================================
function showTabOverlay(tabs, activeIdx) {
  chrome.runtime.sendMessage({ type: 'TAB_OVERLAY', action: 'show', tabs, activeIdx });
}

function updateTabOverlay(activeIdx) {
  chrome.runtime.sendMessage({ type: 'TAB_OVERLAY', action: 'update', tabs: tabList, activeIdx });
}

function exitTabMode() {
  tabMode = 'idle';
  tabList = [];
  chrome.runtime.sendMessage({ type: 'TAB_OVERLAY', action: 'hide' });
  gestureLabel.textContent = 'Hand detected';
}

// =============================================================================
// GESTURE FEEDBACK PILL
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
// =============================================================================
function sendToTab(msg) {
  chrome.runtime.sendMessage({ type: 'GESTURE_TO_TAB', payload: msg });
}