// =============================================================================
// content/executor.js
// Executes single steps from voice command action plans.
// Called by main.js when EXECUTE_STEP messages arrive.
// Depends on: utils.js (toViewport)
// =============================================================================

async function executeStep(step) {
  try {
    switch (step.action) {
      case 'click_text':     return clickText(step.text, step.contains);
      case 'click_selector': return clickSelector(step.selector);
      case 'type':           return typeInto(step.selector, step.text, step.clear !== false);
      case 'press_enter':    return pressEnter(step.selector);
      case 'scroll':         return scrollPage(step.direction, step.amount || 600);
      case 'wait_for':       return waitForElement(step.selector, step.timeout_ms || 5000);
      default:               return { ok: false, error: 'Unknown action: ' + step.action };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function clickText(text, contains) {
  var all   = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],li,span,div,h3'));
  var t     = text.toLowerCase().trim();
  var match = all.find(function(el) {
    var s = (el.innerText || el.textContent || '').trim().toLowerCase();
    return contains ? s.includes(t) : s === t;
  });
  if (!match) return { ok: false, error: 'Text not found: ' + text };
  match.scrollIntoView({ behavior: 'smooth', block: 'center' });
  match.click();
  return { ok: true };
}

function clickSelector(selector) {
  var el = document.querySelector(selector);
  if (!el) return { ok: false, error: 'Not found: ' + selector };
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.click();
  return { ok: true };
}

function typeInto(selector, text, clear) {
  var el = document.querySelector(selector);
  if (!el) return { ok: false, error: 'Input not found: ' + selector };
  el.focus();
  var proto  = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var desc   = Object.getOwnPropertyDescriptor(proto, 'value');
  var setter = desc && desc.set;
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
  var el   = selector ? document.querySelector(selector) : document.activeElement;
  if (!el) return { ok: false, error: 'No element for Enter' };
  var opts = { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent('keydown',  opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup',    opts));
  var form = el.closest('form');
  if (form) { if (form.requestSubmit) form.requestSubmit(); else form.submit(); }
  return { ok: true };
}

function scrollPage(direction, amount) {
  window.scrollBy({ top: direction === 'down' ? amount : -amount, behavior: 'smooth' });
  return { ok: true };
}

function waitForElement(selector, timeoutMs) {
  return new Promise(function(resolve) {
    if (document.querySelector(selector)) { resolve({ ok: true }); return; }
    var obs = new MutationObserver(function() {
      if (document.querySelector(selector)) {
        obs.disconnect();
        clearTimeout(t);
        resolve({ ok: true });
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    var t = setTimeout(function() { obs.disconnect(); resolve({ ok: true, warning: 'timeout' }); }, timeoutMs);
  });
}
