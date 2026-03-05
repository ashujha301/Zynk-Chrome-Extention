// =============================================================================
// popup/gesture-detection.js
// Landmark math, finger state classification, cursor smoothing,
// and the per-frame gesture pipeline (processFrame).
//
// Depends on:
//   ui.js               (gestureLabel)
//   gesture-actions.js  (sendToTab, startScroll, stopScroll,
//                        showGestureFeedback, debounce,
//                        showTabOverlay, updateTabOverlay, exitTabMode,
//                        tab state vars: tabMode, tabList, tabHighlight,
//                        tabFistXSmooth, tabFistXPrev)
// =============================================================================

// -- Cursor state -------------------------------------------------------------
let cursorVisible = false;
let cursorSmX     = 0.5;
let cursorSmY     = 0.5;

// Hand typically occupies 18%-82% of camera frame.
// We remap that range to 0-1 so you don't need to reach the edges.
const CURSOR_SMOOTH  = 0.30;  // EMA factor: 0=frozen, 1=raw jitter
const CURSOR_IN_MIN  = 0.18;  // camera value that maps to screen edge 0
const CURSOR_IN_MAX  = 0.82;  // camera value that maps to screen edge 1

// -- Pinch state --------------------------------------------------------------
let isPinching      = false;
let pinchStartX     = 0;
let pinchStartY     = 0;
let pinchDragActive = false;

// =============================================================================
// LANDMARK MATH HELPERS
// All coordinates are normalised 0..1, y increases downward.
// =============================================================================

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Finger extended: tip clearly above its MCP knuckle
function isUp(lm, tip, mcp) {
  return lm[tip].y < lm[mcp].y - 0.03;
}

// Finger curled: tip clearly below its MCP knuckle
function isDown(lm, tip, mcp) {
  return lm[tip].y > lm[mcp].y + 0.02;
}

// Finger half-folded: tip near MCP level (neither extended nor fully curled)
function isHalf(lm, tip, mcp) {
  const dy = lm[mcp].y - lm[tip].y; // positive = tip above MCP
  return dy > -0.01 && dy < 0.05;
}

// Returns an object of boolean finger states for the given landmark set
function fingerStates(lm) {
  return {
    index:      isUp(lm, 8,  5),
    middle:     isUp(lm, 12, 9),
    ring:       isUp(lm, 16, 13),
    pinky:      isUp(lm, 20, 17),
    indexDown:  isDown(lm, 8,  5),
    middleDown: isDown(lm, 12, 9),
    ringDown:   isDown(lm, 16, 13),
    pinkyDown:  isDown(lm, 20, 17),
    indexHalf:  isHalf(lm, 8,  5),
    middleHalf: isHalf(lm, 12, 9),
    // Thumb: compare tip Y vs wrist Y (landmark 0)
    thumbUp:    lm[4].y < lm[0].y - 0.08,   // tip well above wrist
    thumbDown:  lm[4].y > lm[0].y + 0.05    // tip well below wrist
  };
}

// Distance between thumb tip (4) and index tip (8)
function getPinchDist(lm) {
  return dist(lm[4], lm[8]);
}

// Map raw index-tip coordinates to smooth, full-screen-covering position.
// Flips X (camera is mirrored), remaps the active range, applies EMA.
function smoothCursor(rawX, rawY) {
  const fx = 1.0 - rawX; // flip X for mirror

  function remap(v) {
    return Math.max(0, Math.min(1,
      (v - CURSOR_IN_MIN) / (CURSOR_IN_MAX - CURSOR_IN_MIN)
    ));
  }

  const mx = remap(fx);
  const my = remap(rawY);

  cursorSmX += (mx - cursorSmX) * CURSOR_SMOOTH;
  cursorSmY += (my - cursorSmY) * CURSOR_SMOOTH;

  return { x: cursorSmX, y: cursorSmY };
}

// =============================================================================
// PER-FRAME GESTURE PIPELINE
//
// Called every frame by camera.js > onHandResults.
// Priority (checked in order):
//   1. Pinch           -> click / drag
//   2. Index + Ring    -> new tab
//   3. Open hand       -> tab switcher
//   4. One finger      -> cursor
//   5. Two fingers up  -> scroll up
//   6. Two fingers half-> scroll down
//   7. Thumb up        -> copy
//   8. Thumb down      -> paste
// =============================================================================
function processFrame(lm) {
  const f     = fingerStates(lm);
  const pinch = getPinchDist(lm) < 0.07;       // ~7% of frame width
  const pos   = smoothCursor(lm[8].x, lm[8].y); // smoothed index tip

  // -- Gesture booleans -------------------------------------------------

  const pointing   = f.index && !f.middle;
  // twoFull only fires outside tab mode to avoid conflict with open hand
  const twoFull    = f.index && f.middle && !f.ring && !f.pinky && tabMode === 'idle';
  const twoHalf    = f.indexHalf && f.middleHalf && !f.ring && !f.pinky;
  const openHand   = f.index && f.middle && f.ring && f.pinky;
  const indexRing  = f.index && !f.middle && f.ring && !f.pinky;
  const isFist     = f.indexDown && f.middleDown && f.ringDown && f.pinkyDown;
  const thumbsUp   = f.thumbUp   && !f.index && !f.middle && !f.ring && !f.pinky;
  const thumbsDown = f.thumbDown && !f.index && !f.middle && !f.ring && !f.pinky;

  // =========================================================================
  // 1. PINCH -> CLICK or DRAG
  //    Checked first every frame   works regardless of other finger state.
  //    This means the user can pinch from pointing mode, two-finger mode, etc.
  // =========================================================================
  if (pinch) {
    if (!isPinching) {
      isPinching      = true;
      pinchStartX     = pos.x;
      pinchStartY     = pos.y;
      pinchDragActive = false;
    } else {
      const dx = Math.abs(pos.x - pinchStartX);
      const dy = Math.abs(pos.y - pinchStartY);
      if (!pinchDragActive && (dx > 0.04 || dy > 0.04)) {
        pinchDragActive = true;
        sendToTab({ type: 'GESTURE_DRAG_START', nx: pinchStartX, ny: pinchStartY });
        gestureLabel.textContent = 'DRAG SELECT';
      }
      if (pinchDragActive) {
        sendToTab({ type: 'GESTURE_DRAG_MOVE', nx: pos.x, ny: pos.y });
      }
    }
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = pinchDragActive ? 'DRAG SELECT' : 'PINCHING...';
    stopScroll();
    return;

  } else if (isPinching) {
    if (pinchDragActive) {
      sendToTab({ type: 'GESTURE_DRAG_END' });
      gestureLabel.textContent = 'SELECT DONE';
    } else {
      debounce('PINCH_CLICK', () => {
        sendToTab({ type: 'GESTURE_PINCH_CLICK', nx: pos.x, ny: pos.y });
        showGestureFeedback('CLICK');
      });
    }
    isPinching      = false;
    pinchDragActive = false;
  }

  // =========================================================================
  // 2. INDEX + RING -> NEW TAB  (middle curled, pinky curled)
  // =========================================================================
  if (indexRing && tabMode === 'idle') {
    debounce('NEW_TAB', () => {
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'new_tab' });
      showGestureFeedback('NEW TAB');
    });
    gestureLabel.textContent = 'NEW TAB';
    stopScroll();
    return;
  }

  // =========================================================================
  // 3. TAB SWITCHER  (open hand -> fist navigate -> open hand confirm)
  //    Full state machine is in gesture-actions.js (handleTabSwitcher).
  // =========================================================================
  const tabHandled = handleTabSwitcher(lm, f, pinch, pointing, openHand, isFist);
  if (tabHandled) return;

  // =========================================================================
  // 4. ONE FINGER -> CURSOR
  // =========================================================================
  if (pointing) {
    cursorVisible = true;
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = 'CURSOR';
    stopScroll();
    return;
  } else if (cursorVisible && !pointing) {
    cursorVisible = false;
    sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
  }

  // =========================================================================
  // 5. TWO FINGERS FULLY UP -> SCROLL UP
  // =========================================================================
  if (twoFull) {
    startScroll('up');
    gestureLabel.textContent = 'SCROLL UP';
    return;
  }

  // =========================================================================
  // 6. TWO FINGERS HALF -> SCROLL DOWN
  // =========================================================================
  if (twoHalf) {
    startScroll('down');
    gestureLabel.textContent = 'SCROLL DOWN';
    return;
  }

  stopScroll(); // no scroll gesture active

  // =========================================================================
  // 7. THUMB UP -> COPY
  // =========================================================================
  if (thumbsUp) {
    debounce('THUMBS_UP', () => {
      sendToTab({ type: 'GESTURE_COPY' });
      showGestureFeedback('COPY');
    });
    gestureLabel.textContent = 'COPY';
    return;
  }

  // =========================================================================
  // 8. THUMB DOWN -> PASTE
  // =========================================================================
  if (thumbsDown) {
    debounce('THUMBS_DOWN', () => {
      sendToTab({ type: 'GESTURE_PASTE' });
      showGestureFeedback('PASTE');
    });
    gestureLabel.textContent = 'PASTE';
    return;
  }

  gestureLabel.textContent = 'Hand detected';
}
