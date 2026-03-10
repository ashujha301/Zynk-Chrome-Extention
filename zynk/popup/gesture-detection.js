// GESTURE MAP (priority order):
//   1. YO (index + pinky)        -> NEXT TAB
//   2. OPEN PALM                 -> TAB SWITCHER (slide L/R, fist = open)
//   3. INDEX + MIDDLE up         -> SCROLL UP   (both tips above MCP)
//   4. INDEX + MIDDLE down       -> SCROLL DOWN (both tips below MCP)
//   5. MIDDLE only up            -> BROWSER BACK
//   6. INDEX + MIDDLE + RING up  -> BROWSER FORWARD
//   7. INDEX only (moving)       -> CURSOR MOVES
//   8. INDEX + THUMB L-shape     -> CURSOR FROZEN
//   9. INDEX + THUMB PINCH       -> CLICK on contact / DRAG after 1.5s
//
// Depends on:
//   ui.js              (gestureLabel)
//   gesture-actions.js (sendToTab, startScrollSlow, stopScroll,
//                       showGestureFeedback, debounce,
//                       handleTabSwitcher, tabMode)


// -- Smoothed cursor ----------------------------------------------------------
let cursorSmX = 0.5;
let cursorSmY = 0.5;
const CURSOR_SMOOTH = 0.18;
const CURSOR_IN_MIN = 0.15;
const CURSOR_IN_MAX = 0.85;

// -- Cursor state -------------------------------------------------------------
let cursorVisible  = false;
let cursorFrozen   = false;
let cursorFrozenX  = 0.5;
let cursorFrozenY  = 0.5;

// -- Pinch / click / drag -----------------------------------------------------
let pinchHeld       = false;
let pinchStartTime  = 0;
let pinchClickFired = false;
let pinchDragActive = false;
const DRAG_HOLD_MS  = 1500;

// -- Scroll state -------------------------------------------------------------
// Tracks which scroll gesture is active so we can stop it cleanly
// when the user drops the gesture.
let scrollActive = false; // true while a scroll gesture is held


// LANDMARK HELPERS
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isUp(lm, tip, mcp) {
  return lm[tip].y < lm[mcp].y - 0.03;
}

function isDown(lm, tip, mcp) {
  return lm[tip].y > lm[mcp].y + 0.02;
}

function fingerStates(lm) {
  return {
    index:      isUp(lm,   8,  5),
    middle:     isUp(lm,  12,  9),
    ring:       isUp(lm,  16, 13),
    pinky:      isUp(lm,  20, 17),
    indexDown:  isDown(lm,  8,  5),
    middleDown: isDown(lm, 12,  9),
    ringDown:   isDown(lm, 16, 13),
    pinkyDown:  isDown(lm, 20, 17)
  };
}

function smoothCursor(rawX, rawY) {
  const fx = 1.0 - rawX;
  function remap(v) {
    return Math.max(0, Math.min(1,
      (v - CURSOR_IN_MIN) / (CURSOR_IN_MAX - CURSOR_IN_MIN)
    ));
  }
  cursorSmX += (remap(fx)    - cursorSmX) * CURSOR_SMOOTH;
  cursorSmY += (remap(rawY)  - cursorSmY) * CURSOR_SMOOTH;
  return { x: cursorSmX, y: cursorSmY };
}

// L-shape: thumb extended sideways while index points up.
// Large X-gap between thumb tip and index tip, not close together (not pinching).
function isLShape(lm) {
  const xGap = Math.abs(lm[4].x - lm[8].x);
  const d    = dist(lm[4], lm[8]);
  return xGap > 0.08 && d > 0.09;
}


// MAIN FRAME PIPELINE
function processFrame(lm) {
  const f   = fingerStates(lm);
  const pos = smoothCursor(lm[8].x, lm[8].y);

  // ---- Composite gesture booleans -----------------------------------------

  // Yo: index + pinky up, middle + ring down
  const yoGesture = f.index && f.pinky && !f.middle && !f.ring;

  // Palm: all 4 fingers up
  const openPalm = f.index && f.middle && f.ring && f.pinky;

  // Fist: all 4 fingers curled
  const isFist = f.indexDown && f.middleDown && f.ringDown && f.pinkyDown;

  // TWO FINGERS UP: index + middle up, ring + pinky down -> SCROLL UP
  // Both tips must be clearly above their MCP knuckles.
  const twoFingersUp = f.index && f.middle && !f.ring && !f.pinky
                       && f.ringDown && f.pinkyDown;

  // TWO FINGERS DOWN: index + middle tips below their MCP (pointing downward)
  // This is the hand tilted / fingers curled downward, distinct from a fist
  // (fist has ALL fingers down; here only index+middle are pointing down while
  // ring+pinky can be in any state, but we require ring+pinky NOT extended up
  // to avoid conflict with other gestures).
  const twoFingersDown = f.indexDown && f.middleDown && !f.ring && !f.pinky;

  // BACK: middle finger only up, index + ring + pinky down
  const backGesture = yoGesture

  // FORWARD: index + middle + ring all up, pinky down
  const forwardGesture = f.index && f.middle && f.ring && f.pinkyDown && !f.pinky;

  // Cursor: index up, middle + ring down (pinky free, handled by yo above)
  const indexUp = f.index && !f.middle && !f.ring;

  // L-shape freeze
  const lShape = indexUp && isLShape(lm);

  // Pinch
  const isPinching = dist(lm[4], lm[8]) < 0.07;


  // PRIORITY 1: YO -> NEXT TAB
  if (yoGesture && tabMode === 'idle') {
    debounce('NEXT_TAB', () => {
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'next_tab' });
      showGestureFeedback('NEXT TAB');
    });
    gestureLabel.textContent = 'NEXT TAB';
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: cursorFrozenX, ny: cursorFrozenY });
    if (scrollActive) { scrollActive = false; stopScroll(); }
    return;
  }


  // PRIORITY 2: OPEN PALM -> TAB SWITCHER
  // Overlay shows ONLY while palm is active. When palm drops or hand
  // disappears the overlay is removed immediately via exitTabMode().
  if (openPalm || (tabMode !== 'idle' && isFist)) {
    const tabHandled = handleTabSwitcher(lm, f, openPalm, isFist);
    if (tabHandled) {
      if (scrollActive) { scrollActive = false; stopScroll(); }
      if (cursorVisible) {
        cursorVisible = false;
        sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
      }
      return;
    }
  }

  // If we were in tab mode but fell through (not palm, not fist),
  // handleTabSwitcher already called exitTabMode() - overlay is gone.


  // PRIORITY 3: TWO FINGERS UP -> SCROLL UP
  // Index + middle both pointing up, ring + pinky curled.

  if (twoFingersUp) {
    startScrollSlow('up');
    gestureLabel.textContent = 'SCROLL UP';
    scrollActive = true;
    if (cursorVisible) {
      cursorVisible = false;
      sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
    }
    return;
  }


  // PRIORITY 4: TWO FINGERS DOWN -> SCROLL DOWN
  // Index + middle both pointing downward (tips below MCP).

  if (twoFingersDown) {
    startScrollSlow('down');
    gestureLabel.textContent = 'SCROLL DOWN';
    scrollActive = true;
    if (cursorVisible) {
      cursorVisible = false;
      sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
    }
    return;
  }

  // Neither scroll gesture active - stop scroll if it was running
  if (scrollActive) {
    scrollActive = false;
    stopScroll();
  }


  // PRIORITY 5: BACK (middle + pinky finger only up)
  if (backGesture) {
    debounce('NAV_BACK', () => {
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'nav_back' });
      showGestureFeedback('BACK');
    });
    gestureLabel.textContent = 'GO BACK';
    return;
  }


  // PRIORITY 6: FORWARD (index + middle + ring up, pinky down)

  if (forwardGesture) {
    debounce('NAV_FORWARD', () => {
      chrome.runtime.sendMessage({ type: 'TAB_ACTION', action: 'nav_forward' });
      showGestureFeedback('FORWARD');
    });
    gestureLabel.textContent = 'GO FORWARD';
    return;
  }


  // PRIORITY 7 + 8 + 9: CURSOR SYSTEM
  //   A. PINCH    -> click on contact, drag after 2.5s
  //   B. L-SHAPE  -> frozen
  //   C. INDEX    -> moving

  if (indexUp) {
    if (!cursorVisible) cursorVisible = true;

    // ---- A: PINCH ----
    if (isPinching) {
      if (!pinchHeld) {
        pinchHeld       = true;
        pinchStartTime  = Date.now();
        pinchClickFired = false;
        pinchDragActive = false;
        // Click fires immediately on pinch contact
        sendToTab({ type: 'GESTURE_PINCH_CLICK', nx: cursorFrozenX, ny: cursorFrozenY });
        showGestureFeedback('CLICK');
        pinchClickFired = true;
      } else {
        const heldMs = Date.now() - pinchStartTime;
        if (!pinchDragActive && heldMs >= DRAG_HOLD_MS) {
          pinchDragActive = true;
          sendToTab({ type: 'GESTURE_DRAG_START', nx: cursorFrozenX, ny: cursorFrozenY });
        }
        if (pinchDragActive) {
          cursorFrozenX = pos.x;
          cursorFrozenY = pos.y;
          sendToTab({ type: 'GESTURE_DRAG_MOVE', nx: pos.x, ny: pos.y });
          sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
          gestureLabel.textContent = 'DRAG';
        } else {
          const secsLeft = ((DRAG_HOLD_MS - heldMs) / 1000).toFixed(1);
          gestureLabel.textContent = 'Hold ' + secsLeft + 's for drag';
          sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: cursorFrozenX, ny: cursorFrozenY });
        }
      }
      return;

    } else if (pinchHeld) {
      pinchHeld = false;
      if (pinchDragActive) {
        sendToTab({ type: 'GESTURE_DRAG_END' });
        pinchDragActive = false;
        gestureLabel.textContent = 'SELECT DONE';
      }
    }

    // ---- B: L-SHAPE FREEZE ----
    if (lShape) {
      cursorFrozen = true;
      sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: cursorFrozenX, ny: cursorFrozenY });
      gestureLabel.textContent = 'FROZEN  pinch to click';
      return;
    }

    // ---- C: MOVING ----
    cursorFrozen  = false;
    cursorFrozenX = pos.x;
    cursorFrozenY = pos.y;
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = 'CURSOR';
    return;

  } else {
    if (cursorVisible) {
      cursorVisible   = false;
      cursorFrozen    = false;
      pinchHeld       = false;
      pinchDragActive = false;
      sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
    }
  }

  gestureLabel.textContent = 'Hand detected';
}