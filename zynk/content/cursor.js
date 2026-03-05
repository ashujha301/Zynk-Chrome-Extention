// =============================================================================
// content/cursor.js
// Injects and moves the gesture cursor arrow inside the active tab.
// Uses top/left (not transform) so position is correct regardless of scroll.
// =============================================================================

var __zynkCursor    = null;
var __zynkCursorX   = -100;
var __zynkCursorY   = -100;
var __zynkRafPending = false;

function getOrCreateCursor() {
  if (__zynkCursor && document.documentElement.contains(__zynkCursor)) {
    return __zynkCursor;
  }
  __zynkCursor = document.createElement('div');
  __zynkCursor.id = '__zynk_cursor';
  __zynkCursor.innerHTML =
    '<svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 2 L3 22 L8 17 L11 25 L14 24 L11 16 L18 16 Z"' +
      ' fill="white" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>';
  Object.assign(__zynkCursor.style, {
    position:      'fixed',
    top:           '0px',
    left:          '0px',
    width:         '22px',
    height:        '28px',
    pointerEvents: 'none',
    zIndex:        '2147483647',
    display:       'none',
    willChange:    'top, left',
  });
  document.documentElement.appendChild(__zynkCursor);
  return __zynkCursor;
}

// Move cursor   batched in rAF so it renders once per frame
function moveCursor(x, y) {
  __zynkCursorX = x;
  __zynkCursorY = y;
  if (__zynkRafPending) return;
  __zynkRafPending = true;
  requestAnimationFrame(function() {
    __zynkRafPending = false;
    var c = getOrCreateCursor();
    c.style.display = 'block';
    c.style.left    = __zynkCursorX + 'px';
    c.style.top     = __zynkCursorY + 'px';
  });
}

function hideCursor() {
  if (__zynkCursor) __zynkCursor.style.display = 'none';
}
