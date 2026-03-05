// content.js — receives one step at a time from background.js
// Background re-injects this after every navigation.

// Guard against double-injection registering duplicate listeners
if (!window.__zynkContentLoaded) {
  window.__zynkContentLoaded = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "EXECUTE_STEP") {
      executeStep(message.step).then(sendResponse);
      return true; // keep channel open for async response
    }
  });
}

async function executeStep(step) {
  try {
    switch (step.action) {
      case "click_text":     return clickText(step.text, step.contains);
      case "click_selector": return clickSelector(step.selector);
      case "type":           return typeInto(step.selector, step.text, step.clear !== false);
      case "press_enter":    return pressEnter(step.selector);
      case "scroll":         return scrollPage(step.direction, step.amount || 600);
      case "wait_for":       return waitForElement(step.selector, step.timeout_ms || 5000);
      default:               return { ok: false, error: `Unknown action: ${step.action}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- click_text ----------------------------------------------
function clickText(text, contains = false) {
  const all = Array.from(document.querySelectorAll(
    "a, button, [role='button'], [role='link'], li, span, div, h3"
  ));

  const target = text.toLowerCase().trim();

  const match = all.find(el => {
    const t = (el.innerText || el.textContent || "").trim().toLowerCase();
    return contains ? t.includes(target) : t === target;
  });

  if (!match) return { ok: false, error: `Text not found: "${text}"` };

  match.scrollIntoView({ behavior: "smooth", block: "center" });
  match.click();
  return { ok: true, tag: match.tagName };
}

// --------------- click_selector ---------------------------------
function clickSelector(selector) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: `Not found: ${selector}` };
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.click();
  return { ok: true };
}

// --------------- type ---------------------------------
function typeInto(selector, text, clear = true) {
  const el = document.querySelector(selector);
  if (!el) return { ok: false, error: `Input not found: ${selector}` };

  el.focus();
  el.scrollIntoView({ behavior: "smooth", block: "center" });

  // Clear using native setter so React/Vue controlled inputs update properly
  if (clear) {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, "");
    } else {
      el.value = "";
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Set full value at once and fire events — more reliable than char-by-char
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, text);
  } else {
    el.value = text;
  }

  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown",  { key: "a", bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup",    { key: "a", bubbles: true }));

  return { ok: true };
}

// --------------- press_enter ---------------------------------
function pressEnter(selector) {
  const el = selector
    ? document.querySelector(selector)
    : document.activeElement;

  if (!el) return { ok: false, error: "No element for Enter" };

  const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown",  opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup",    opts));

  const form = el.closest("form");
  if (form) form.requestSubmit?.() || form.submit?.();

  return { ok: true };
}

// --------------- scroll ---------------------------------
function scrollPage(direction, amount = 600) {
  window.scrollBy({ top: direction === "down" ? amount : -amount, behavior: "smooth" });
  return { ok: true };
}

// --------------- wait_for ---------------------------------
function waitForElement(selector, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve({ ok: true });
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        clearTimeout(timer);
        resolve({ ok: true });
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      // Don't fail hard — element might just be slow; let next step try
      resolve({ ok: true, warning: `Timeout waiting for ${selector}` });
    }, timeoutMs);
  });
}