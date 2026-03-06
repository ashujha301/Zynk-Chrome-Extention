// =============================================================================
// content/cursor.js
// Single gesture cursor arrow. Uses CSS transform: translate() for movement
// so the browser GPU-composites it with zero layout cost and zero trace.
//
// Why transform instead of top/left:
//   top/left triggers layout recalculation -> browser can paint at old position
//   for one frame while layout is pending -> visible trace / ghost.
//   transform is GPU-composited -> position updates atomically, no trace ever.
// =============================================================================

var __zynkCursor = null;

function getOrCreateCursor() {
  if (__zynkCursor && document.documentElement.contains(__zynkCursor)) {
    return __zynkCursor;
  }
  // Remove any stale element from a previous injection
  var old = document.getElementById('__zynk_cursor');
  if (old) old.parentNode.removeChild(old);

  __zynkCursor = document.createElement('div');
  __zynkCursor.id = '__zynk_cursor';

  // Standard OS-style arrow cursor SVG pointing top-left
  __zynkCursor.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 2 L4 18 L8 14 L11 22 L13 21 L10 13 L16 13 Z"' +
      ' fill="white" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>';

  Object.assign(__zynkCursor.style, {
    position:        'fixed',
    top:             '0px',
    left:            '0px',
    width:           '24px',
    height:          '24px',
    pointerEvents:   'none',
    zIndex:          '2147483647',
    display:         'none',
    // transform is GPU layer - moves with zero layout, zero trace
    transform:       'translate(-9999px, -9999px)',
    willChange:      'transform',
    // No transition - instant movement
  });

  document.documentElement.appendChild(__zynkCursor);
  return __zynkCursor;
}

// Move cursor to pixel position using transform (no layout, no trace)
function moveCursor(x, y) {
  var c = getOrCreateCursor();
  c.style.display   = 'block';
  // translate positions the element's top-left corner
  c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
}

function hideCursor() {
  var c = document.getElementById('__zynk_cursor');
  if (c) {
    c.style.display   = 'none';
    // Move off-screen so it doesn't block elementFromPoint during click
    c.style.transform = 'translate(-9999px, -9999px)';
  }
}