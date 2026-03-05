// =============================================================================
// ZYNK content.js — single-step executor + gesture handler
// Background re-injects this after every navigation.
// Guard prevents double-listener registration.
// =============================================================================

if (!window.__zynkLoaded) {
  window.__zynkLoaded = true;
  initZynk();
}

function initZynk() {

  // ── Gesture cursor element ─────────────────────────────────────────────────
  let cursor = null;

  function getOrCreateCursor() {
    if (cursor && document.body.contains(cursor)) return cursor;
    cursor = document.createElement('div');
    cursor.id = '__zynk_cursor';
    cursor.innerHTML = `
      <svg width="28" height="34" viewBox="0 0 28 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <filter id="shadow">
          <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-opacity="0.4"/>
        </filter>
        <path d="M4 2 L4 24 L9 19 L13 28 L16 27 L12 18 L20 18 Z"
              fill="white" stroke="#333" stroke-width="1.2"
              filter="url(#shadow)"/>
      </svg>`;
    Object.assign(cursor.style, {
      position:       'fixed',
      top:            '0',
      left:           '0',
      width:          '28px',
      height:         '34px',
      pointerEvents:  'none',     // never blocks clicks
      zIndex:         '2147483647',
      transform:      'translate(-2px, -2px)',
      transition:     'transform 0.05s linear',
      display:        'none',
    });
    document.body.appendChild(cursor);
    return cursor;
  }

  // Convert normalized (0..1) position → page pixel coordinates
  function normToScreen(nx, ny) {
    return {
      x: Math.round(nx * window.innerWidth),
      y: Math.round(ny * window.innerHeight)
    };
  }

  // ── Drag state ─────────────────────────────────────────────────────────────
  let dragStartEl  = null;
  let dragStartPos = null;

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // ── Step-based actions (voice commands) ──
    if (message.type === 'EXECUTE_STEP') {
      executeStep(message.step).then(sendResponse);
      return true;
    }

    // ── Gesture: move custom cursor ──
    if (message.type === 'GESTURE_CURSOR_MOVE') {
      const c = getOrCreateCursor();
      const p = normToScreen(message.nx, message.ny);
      c.style.display  = 'block';
      c.style.left     = p.x + 'px';
      c.style.top      = p.y + 'px';
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: hide cursor ──
    if (message.type === 'GESTURE_CURSOR_HIDE') {
      if (cursor) cursor.style.display = 'none';
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: pinch click at position ──
    if (message.type === 'GESTURE_PINCH_CLICK') {
      const p   = normToScreen(message.nx, message.ny);
      // Temporarily hide cursor so elementFromPoint works correctly
      if (cursor) cursor.style.display = 'none';
      const el  = document.elementFromPoint(p.x, p.y);
      if (cursor) cursor.style.display = 'block';
      if (el) {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: p.x, clientY: p.y }));
        el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, clientX: p.x, clientY: p.y }));
        el.dispatchEvent(new MouseEvent('click',     { bubbles: true, clientX: p.x, clientY: p.y }));
        // Flash visual
        const orig = el.style.outline;
        el.style.outline = '2px solid rgba(124,106,255,0.8)';
        setTimeout(() => { el.style.outline = orig; }, 400);
      }
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: drag start (pinch+move = text selection) ──
    if (message.type === 'GESTURE_DRAG_START') {
      const p  = normToScreen(message.nx, message.ny);
      if (cursor) cursor.style.display = 'none';
      dragStartEl  = document.elementFromPoint(p.x, p.y);
      if (cursor) cursor.style.display = 'block';
      dragStartPos = p;
      if (dragStartEl) {
        dragStartEl.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, clientX: p.x, clientY: p.y
        }));
      }
      // Start a selection at this point
      const range = document.createRange();
      const sel   = window.getSelection();
      try {
        const node = getTextNodeAt(p.x, p.y);
        if (node) {
          range.setStart(node.node, node.offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: drag move ──
    if (message.type === 'GESTURE_DRAG_MOVE') {
      const p = normToScreen(message.nx, message.ny);
      if (cursor) {
        cursor.style.left = p.x + 'px';
        cursor.style.top  = p.y + 'px';
      }
      // Extend selection
      try {
        const sel  = window.getSelection();
        const node = getTextNodeAt(p.x, p.y);
        if (node && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.setEnd(node.node, node.offset);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
      if (dragStartEl) {
        dragStartEl.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true, clientX: p.x, clientY: p.y, buttons: 1
        }));
      }
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: drag end ──
    if (message.type === 'GESTURE_DRAG_END') {
      if (dragStartEl) {
        dragStartEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }
      dragStartEl  = null;
      dragStartPos = null;
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: copy (fist) ──
    if (message.type === 'GESTURE_COPY') {
      document.execCommand('copy');
      flashOverlay('✊ Copied!', '#7c6aff');
      sendResponse({ ok: true });
      return false;
    }

    // ── Gesture: paste (thumbs up) ──
    if (message.type === 'GESTURE_PASTE') {
      // navigator.clipboard.readText() requires user gesture in page context — use execCommand
      document.execCommand('paste');
      flashOverlay('👍 Pasted!', '#22c55e');
      sendResponse({ ok: true });
      return false;
    }

  });

  // ── Helper: get text node + offset at screen point ─────────────────────────
  function getTextNodeAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      for (const rect of rects) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          // Binary-search for character offset
          let lo = 0, hi = node.textContent.length;
          while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            const r2  = document.createRange();
            r2.setStart(node, 0); r2.setEnd(node, mid);
            const r2rect = r2.getBoundingClientRect();
            if (r2rect.right < x) lo = mid + 1; else hi = mid;
          }
          return { node, offset: lo };
        }
      }
    }
    return null;
  }

  // ── Toast overlay for gesture feedback ────────────────────────────────────
  function flashOverlay(text, color = '#7c6aff') {
    let toast = document.getElementById('__zynk_toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = '__zynk_toast';
      Object.assign(toast.style, {
        position:       'fixed',
        bottom:         '28px',
        left:           '50%',
        transform:      'translateX(-50%)',
        background:     'rgba(10,10,15,0.92)',
        color:          '#fff',
        padding:        '8px 20px',
        borderRadius:   '20px',
        fontFamily:     'monospace',
        fontSize:       '13px',
        fontWeight:     '700',
        letterSpacing:  '0.04em',
        zIndex:         '2147483646',
        pointerEvents:  'none',
        border:         '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(8px)',
        transition:     'opacity 0.25s ease',
      });
      document.body.appendChild(toast);
    }
    toast.style.borderColor = color + '66';
    toast.style.color       = color;
    toast.textContent       = text;
    toast.style.opacity     = '1';
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => { toast.style.opacity = '0'; }, 1400);
  }

  // ==========================================================================
  // STEP-BASED EXECUTOR (voice commands)
  // ==========================================================================
  async function executeStep(step) {
    try {
      switch (step.action) {
        case 'click_text':     return clickText(step.text, step.contains);
        case 'click_selector': return clickSelector(step.selector);
        case 'type':           return typeInto(step.selector, step.text, step.clear !== false);
        case 'press_enter':    return pressEnter(step.selector);
        case 'scroll':         return scrollPage(step.direction, step.amount || 600);
        case 'wait_for':       return waitForElement(step.selector, step.timeout_ms || 5000);
        default:               return { ok: false, error: `Unknown action: ${step.action}` };
      }
    } catch (e) { return { ok: false, error: e.message }; }
  }

  function clickText(text, contains = false) {
    const all = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],li,span,div,h3'));
    const t   = text.toLowerCase().trim();
    const match = all.find(el => {
      const s = (el.innerText || el.textContent || '').trim().toLowerCase();
      return contains ? s.includes(t) : s === t;
    });
    if (!match) return { ok: false, error: `Text not found: "${text}"` };
    match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    match.click();
    return { ok: true };
  }

  function clickSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: `Not found: ${selector}` };
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return { ok: true };
  }

  function typeInto(selector, text, clear = true) {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, error: `Input not found: ${selector}` };
    el.focus();
    const proto  = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (clear) {
      setter ? setter.call(el, '') : (el.value = '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setter ? setter.call(el, text) : (el.value = text);
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  }

  function pressEnter(selector) {
    const el = selector ? document.querySelector(selector) : document.activeElement;
    if (!el) return { ok: false, error: 'No element for Enter' };
    const opts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true };
    el.dispatchEvent(new KeyboardEvent('keydown',  opts));
    el.dispatchEvent(new KeyboardEvent('keypress', opts));
    el.dispatchEvent(new KeyboardEvent('keyup',    opts));
    const form = el.closest('form');
    if (form) form.requestSubmit?.() || form.submit?.();
    return { ok: true };
  }

  function scrollPage(direction, amount = 600) {
    window.scrollBy({ top: direction === 'down' ? amount : -amount, behavior: 'smooth' });
    return { ok: true };
  }

  function waitForElement(selector, timeoutMs = 5000) {
    return new Promise(resolve => {
      if (document.querySelector(selector)) { resolve({ ok: true }); return; }
      const obs = new MutationObserver(() => {
        if (document.querySelector(selector)) { obs.disconnect(); clearTimeout(t); resolve({ ok: true }); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const t = setTimeout(() => { obs.disconnect(); resolve({ ok: true, warning: 'timeout' }); }, timeoutMs);
    });
  }

} // end initZynk