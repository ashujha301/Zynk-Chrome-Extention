// =============================================================================
// content/click.js
// Pinch-click and pinch-drag gesture handlers.
//
// FIXES vs previous version:
//   1. YouTube skip/overlay buttons use pointer events (not just mouse events).
//      YouTube's player listens to pointermove/pointerdown/pointerup — mouse
//      events alone are ignored on the SVG layer, causing the black-flash-but-
//      no-click bug.
//   2. Continuous mousemove dispatch while cursor is moving so YouTube controls
//      (and any hover-triggered UI) appear under the gesture cursor.
//   3. Walk up the DOM to find the nearest clickable ancestor when the hit
//      element itself is non-interactive (e.g. a <path> inside an SVG button).
//   4. Shadow DOM piercing via elementsFromPoint for web components.
//
// Depends on: cursor.js (getOrCreateCursor, hideCursor), utils.js (toViewport)
// =============================================================================

var __zynkDragEl  = null;
var __zynkDragPos = null;

// ---------------------------------------------------------------------------
// HOVER DISPATCH
// Called every frame while cursor is moving (from gesture-detection.js).
// This is what makes YouTube controls appear and tooltips show.
// ---------------------------------------------------------------------------
function dispatchHover(nx, ny) {
  var p = toViewport(nx, ny);
  var el = _hitTarget(p.x, p.y);
  if (!el) return;

  var opts = {
    bubbles: true, cancelable: true,
    clientX: p.x, clientY: p.y,
    pointerId: 1, pointerType: 'mouse',
    isPrimary: true, view: window
  };

  // Pointer events (YouTube player, modern SPAs)
  try { el.dispatchEvent(new PointerEvent('pointermove', opts)); } catch(e) {}
  // Mouse events (legacy sites)
  try { el.dispatchEvent(new MouseEvent('mousemove',  { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y })); } catch(e) {}
  try { el.dispatchEvent(new MouseEvent('mouseover',  { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y })); } catch(e) {}
}

// ---------------------------------------------------------------------------
// CLICK
// ---------------------------------------------------------------------------
function handlePinchClick(nx, ny) {
  var p  = toViewport(nx, ny);
  var el = _hitTarget(p.x, p.y);
  if (!el) return;

  var opts = {
    bubbles: true, cancelable: true,
    clientX: p.x, clientY: p.y,
    pointerId: 1, pointerType: 'mouse',
    isPrimary: true, view: window
  };

  // 1. Pointer events — YouTube player controls require these
  try { el.dispatchEvent(new PointerEvent('pointerover',  opts)); } catch(e) {}
  try { el.dispatchEvent(new PointerEvent('pointerenter', { ...opts, bubbles: false })); } catch(e) {}
  try { el.dispatchEvent(new PointerEvent('pointerdown',  opts)); } catch(e) {}
  try { el.dispatchEvent(new PointerEvent('pointerup',    opts)); } catch(e) {}

  // 2. Mouse events — fallback for everything else
  try { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window })); } catch(e) {}
  try { el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window })); } catch(e) {}
  try { el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, view: window })); } catch(e) {}

  // 3. Focus for inputs/buttons
  try { el.focus({ preventScroll: true }); } catch(e) {}

  // 4. Brief purple ring to confirm what was clicked (remove after 300ms)
  var orig = el.style.outline;
  el.style.outline = '2px solid rgba(124,106,255,0.8)';
  setTimeout(function() { el.style.outline = orig; }, 300);
}

// ---------------------------------------------------------------------------
// HIT TARGET
// Gets the topmost interactive element at (x, y).
//   - Temporarily hides our cursor overlay so it never intercepts the test.
//   - Walks up from the raw hit element to find the nearest clickable ancestor
//     (handles SVG paths, icon spans inside <button>, etc.).
//   - Falls back to the raw element if no clickable ancestor found.
// ---------------------------------------------------------------------------
function _hitTarget(x, y) {
  var c = document.getElementById('__zynk_cursor');
  var saved = '';
  if (c) { saved = c.style.transform; c.style.transform = 'translate(-9999px,-9999px)'; }

  // Use elementsFromPoint to pierce stacking contexts; first real element wins
  var els;
  try { els = document.elementsFromPoint(x, y); } catch(e) { els = []; }
  var raw = null;
  for (var i = 0; i < els.length; i++) {
    if (els[i] !== c && els[i] !== document.documentElement && els[i] !== document.body) {
      raw = els[i]; break;
    }
  }
  if (!raw) raw = document.elementFromPoint(x, y);

  if (c && c.style.display !== 'none') c.style.transform = saved;
  if (!raw) return null;

  // Walk up to nearest clickable ancestor
  return _nearestClickable(raw) || raw;
}

// Walk up the DOM tree to find the nearest element that looks interactive.
function _nearestClickable(el) {
  var CLICKABLE = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|DETAILS)$/;
  var node = el;
  for (var depth = 0; depth < 8 && node && node !== document.body; depth++) {
    if (!node || node.nodeType !== 1) break;
    var tag = (node.tagName || '').toUpperCase();
    if (CLICKABLE.test(tag)) return node;
    var role = (node.getAttribute && node.getAttribute('role') || '').toLowerCase();
    if (role === 'button' || role === 'link' || role === 'menuitem' ||
        role === 'tab'    || role === 'option') return node;
    var cursor = window.getComputedStyle(node).cursor;
    if (cursor === 'pointer') return node;
    if (node.onclick || node.getAttribute('onclick')) return node;
    node = node.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// DRAG
// ---------------------------------------------------------------------------
function handleDragStart(nx, ny) {
  var p = toViewport(nx, ny);
  __zynkDragEl  = _hitTarget(p.x, p.y);
  __zynkDragPos = p;
  if (__zynkDragEl) {
    try { __zynkDragEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', isPrimary: true })); } catch(e) {}
    try { __zynkDragEl.dispatchEvent(new MouseEvent('mousedown',    { bubbles: true, clientX: p.x, clientY: p.y })); } catch(e) {}
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
    try { __zynkDragEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: p.x, clientY: p.y, buttons: 1 })); } catch(e) {}
  }
}

function handleDragEnd() {
  if (__zynkDragEl) {
    try { __zynkDragEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' })); } catch(e) {}
    try { __zynkDragEl.dispatchEvent(new MouseEvent('mouseup',    { bubbles: true })); } catch(e) {}
  }
  __zynkDragEl  = null;
  __zynkDragPos = null;
}