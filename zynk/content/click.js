// =============================================================================
// content/click.js
// Pinch-click and pinch-drag gesture handlers.
// Depends on: cursor.js (getOrCreateCursor, hideCursor), utils.js (toViewport)
// =============================================================================

var __zynkDragEl  = null;
var __zynkDragPos = null;

// -- Pinch click: dispatch mouse events at the cursor position ----------------
function handlePinchClick(nx, ny) {
  var p = toViewport(nx, ny);
  var c = document.getElementById('__zynk_cursor');

  // Move cursor off-screen using transform before elementFromPoint
  // so the cursor element doesn't intercept the hit test.
  // (cursor has pointerEvents:none so this is a safety measure)
  var prevTransform = '';
  if (c) {
    prevTransform = c.style.transform;
    c.style.transform = 'translate(-9999px,-9999px)';
  }

  var el = document.elementFromPoint(p.x, p.y);

  // Restore cursor position only if it was visible.
  // If it was hidden (display:none), leave it hidden - restoring the
  // transform while display is none would cause a one-frame flash
  // when display is set back to block by the next moveCursor call.
  if (c && c.style.display !== 'none') c.style.transform = prevTransform;

  if (el) {
    var opts = { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window };
    el.dispatchEvent(new MouseEvent('mouseover',  opts));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: p.x, clientY: p.y }));
    el.dispatchEvent(new MouseEvent('mousedown',  opts));
    el.dispatchEvent(new MouseEvent('mouseup',    opts));
    el.dispatchEvent(new MouseEvent('click',      opts));
    // Also try focus for inputs/buttons
    if (typeof el.focus === 'function') {
      try { el.focus({ preventScroll: true }); } catch(e) {}
    }
    // Brief highlight to confirm click
    var orig = el.style.outline;
    el.style.outline = '2px solid rgba(124,106,255,0.7)';
    setTimeout(function() { el.style.outline = orig; }, 250);
  }
}

// -- Drag start: mousedown + init selection range ----------------------------
function handleDragStart(nx, ny) {
  var p = toViewport(nx, ny);
  var c = getOrCreateCursor();
  var savedT = c ? c.style.transform : '';
  if (c) c.style.transform = 'translate(-9999px,-9999px)';
  __zynkDragEl = document.elementFromPoint(p.x, p.y);
  if (c) c.style.transform = savedT;
  __zynkDragPos = p;

  if (__zynkDragEl) {
    __zynkDragEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: p.x, clientY: p.y }));
  }
  try {
    var node = getTextNodeAt(p.x, p.y);
    if (node) {
      var range = document.createRange();
      range.setStart(node.node, node.offset);
      range.collapse(true);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch(e) {}
}

// -- Drag move: extend selection to current position -------------------------
function handleDragMove(nx, ny) {
  var p = toViewport(nx, ny);
  moveCursor(p.x, p.y);
  try {
    var sel  = window.getSelection();
    var node = getTextNodeAt(p.x, p.y);
    if (node && sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      range.setEnd(node.node, node.offset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch(e) {}
  if (__zynkDragEl) {
    __zynkDragEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: p.x, clientY: p.y, buttons: 1 }));
  }
}

// -- Drag end: mouseup --------------------------------------------------------
function handleDragEnd() {
  if (__zynkDragEl) {
    __zynkDragEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  __zynkDragEl  = null;
  __zynkDragPos = null;
}