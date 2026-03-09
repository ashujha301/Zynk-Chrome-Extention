// =============================================================================
// content/executor.js
// Executes single steps from voice command action plans.
// Called by main.js when EXECUTE_STEP messages arrive.
// Depends on: utils.js (toViewport)
// =============================================================================

async function executeStep(step) {
  try {
    switch (step.action) {
      // ---- Page interaction ------------------------------------------------
      case 'click_text':     return clickText(step.text, step.contains);
      case 'click_selector': return clickSelector(step.selector);
      case 'type':           return typeInto(step.selector, step.text, step.clear !== false);
      case 'press_enter':    return pressEnter(step.selector);
      case 'scroll':         return scrollPage(step.direction, step.amount || 500);
      case 'scroll_to_edge': return scrollToEdge(step.edge);
      case 'wait_for':       return waitForElement(step.selector, step.timeout_ms || 5000);
      case 'find_text':      return findTextOnPage(step.text);

      // ---- Browser / tab (handled in content, signals background for some) --
      // Note: browser_back, browser_forward, reload, new_tab, close_tab,
      //       next_tab, prev_tab, zoom are all handled in voice-handler.js
      // (background script) because they need chrome.tabs / chrome.windows APIs
      // that are not available in content scripts.
      // These cases should not reach here but we handle gracefully.
      default:
        return { ok: false, error: 'Unknown or background-only action: ' + step.action };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// CLICK BY TEXT
// ---------------------------------------------------------------------------
function clickText(text, contains) {
  var all   = Array.from(document.querySelectorAll(
    'a, button, [role="button"], [role="link"], input[type="submit"], ' +
    'input[type="button"], li, span, div, h1, h2, h3, h4, label, td'
  ));
  var t     = (text || '').toLowerCase().trim();
  var match = all.find(function(el) {
    var s = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
    return contains ? s.includes(t) : s === t;
  });
  if (!match) return { ok: false, error: 'Text not found: ' + text };
  match.scrollIntoView({ behavior: 'smooth', block: 'center' });
  match.focus();
  match.click();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CLICK BY CSS SELECTOR
// ---------------------------------------------------------------------------
function clickSelector(selector) {
  // Support comma-separated fallback selectors: try each until one matches
  var selectors = (selector || '').split(',').map(function(s) { return s.trim(); });
  for (var i = 0; i < selectors.length; i++) {
    try {
      var el = document.querySelector(selectors[i]);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.click();
        return { ok: true };
      }
    } catch(e) {}
  }
  return { ok: false, error: 'Not found: ' + selector };
}

// ---------------------------------------------------------------------------
// TYPE INTO INPUT
// ---------------------------------------------------------------------------
function typeInto(selector, text, clear) {
  var selectors = (selector || '').split(',').map(function(s) { return s.trim(); });
  var el = null;
  for (var i = 0; i < selectors.length; i++) {
    try { el = document.querySelector(selectors[i]); } catch(e) {}
    if (el) break;
  }
  if (!el) return { ok: false, error: 'Input not found: ' + selector };

  el.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  var proto  = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var desc   = Object.getOwnPropertyDescriptor(proto, 'value');
  var setter = desc && desc.set;

  if (clear) {
    setter ? setter.call(el, '') : (el.value = '');
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  setter ? setter.call(el, text) : (el.value = text);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// PRESS ENTER
// ---------------------------------------------------------------------------
function pressEnter(selector) {
  var el = null;
  if (selector) {
    var selectors = selector.split(',').map(function(s) { return s.trim(); });
    for (var i = 0; i < selectors.length; i++) {
      try { el = document.querySelector(selectors[i]); } catch(e) {}
      if (el) break;
    }
  }
  el = el || document.activeElement || document.body;

  var opts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown',  opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup',    opts));

  var form = el.closest('form');
  if (form) {
    try { if (form.requestSubmit) form.requestSubmit(); else form.submit(); } catch(e) {}
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SCROLL
// ---------------------------------------------------------------------------
function scrollPage(direction, amount) {
  window.scrollBy({
    top:      direction === 'down' ? amount : -amount,
    behavior: 'smooth'
  });
  return { ok: true };
}

function scrollToEdge(edge) {
  if (edge === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WAIT FOR ELEMENT
// ---------------------------------------------------------------------------
function waitForElement(selector, timeoutMs) {
  return new Promise(function(resolve) {
    try {
      if (document.querySelector(selector)) { resolve({ ok: true }); return; }
    } catch(e) { resolve({ ok: true }); return; }

    var obs = new MutationObserver(function() {
      try {
        if (document.querySelector(selector)) {
          obs.disconnect();
          clearTimeout(t);
          resolve({ ok: true });
        }
      } catch(e) { obs.disconnect(); clearTimeout(t); resolve({ ok: true }); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    var t = setTimeout(function() {
      obs.disconnect();
      resolve({ ok: true, warning: 'timeout waiting for ' + selector });
    }, timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// FIND TEXT ON PAGE (like Ctrl+F)
// ---------------------------------------------------------------------------
function findTextOnPage(text) {
  if (!text) return { ok: false, error: 'No text to find' };
  // window.find() is supported in Chrome and highlights the first match
  var found = window.find(text, false, false, true, false, false, false);
  return found ? { ok: true } : { ok: false, error: 'Text not found on page: ' + text };
}