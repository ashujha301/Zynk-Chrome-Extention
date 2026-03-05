// =============================================================================
// content/click.js
// Pinch-click and pinch-drag gesture handlers.
// Depends on: cursor.js (getOrCreateCursor, hideCursor), utils.js (toViewport)
// =============================================================================

var __zynkDragEl  = null;
var __zynkDragPos = null;

// -- Pinch click: dispatch mouse events at the cursor position ----------------
function handlePinchClick(nx, ny) {
  var p  = toViewport(nx, ny);
  var c  = getOrCreateCursor();
  var wasVisible = c && c.style.display !== 'none';

  // Temporarily hide cursor so elementFromPoint ignores it
  if (c) c.style.display = 'none';
  var el = document.elementFromPoint(p.x, p.y);
  if (wasVisible && c) c.style.display = 'block';

  if (el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: p.x, clientY: p.y }));
    el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, clientX: p.x, clientY: p.y }));
    el.dispatchEvent(new MouseEvent('click',     { bubbles: true, clientX: p.x, clientY: p.y }));
    // Brief highlight flash
    var orig = el.style.outline;
    el.style.outline = '2px solid rgba(124,106,255,0.7)';
    setTimeout(function() { el.style.outline = orig; }, 300);
  }
}

// -- Drag start: mousedown + init selection range ----------------------------
function handleDragStart(nx, ny) {
  var p = toViewport(nx, ny);
  var c = getOrCreateCursor();
  if (c) c.style.display = 'none';
  __zynkDragEl = document.elementFromPoint(p.x, p.y);
  if (c) c.style.display = 'block';
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
