// =============================================================================
// background/gesture-handler.js
// Routes GESTURE_TO_TAB messages to content.js in the active tab.
//
// Cursor move + scroll use chrome.scripting.executeScript (lowest latency).
// All other gestures go through content.js message listener.
//
// Note: Chrome's native browser UI (tab bar, address bar) is unreachable
// from content scripts   those actions are handled in tab-actions.js.
// Depends on: tabs.js (getRealTab)
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'GESTURE_TO_TAB') return false;

  const p = message.payload;

  (async () => {
    const tab = await getRealTab();
    if (!tab) { sendResponse({ ok: false }); return; }

    // ---- CURSOR MOVE: executeScript skips message round-trip entirely ----
    if (p.type === 'GESTURE_CURSOR_MOVE') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (nx, ny) => {
            var c = document.getElementById('__zynk_cursor');
            if (!c) return;
            c.style.display = 'block';
            c.style.left    = Math.round(nx * window.innerWidth)  + 'px';
            c.style.top     = Math.round(ny * window.innerHeight) + 'px';
          },
          args: [p.nx, p.ny]
        });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    // ---- CURSOR HIDE ----
    if (p.type === 'GESTURE_CURSOR_HIDE') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            var c = document.getElementById('__zynk_cursor');
            if (c) c.style.display = 'none';
            if (window.__zynkScrollTimer) {
              clearInterval(window.__zynkScrollTimer);
              window.__zynkScrollTimer = null;
            }
          }
        });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    // ---- SCROLL START: inject interval directly into page (zero per-tick latency) ----
    if (p.type === 'GESTURE_SCROLL_START') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (dir, px, ms) => {
            if (window.__zynkScrollDir === dir) return;
            if (window.__zynkScrollTimer) clearInterval(window.__zynkScrollTimer);
            window.__zynkScrollDir   = dir;
            window.__zynkScrollTimer = setInterval(() => {
              window.scrollBy({ top: dir === 'down' ? px : -px, behavior: 'auto' });
            }, ms);
          },
          args: [p.dir, p.px || 110, p.ms || 55]
        });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    // ---- SCROLL STOP ----
    if (p.type === 'GESTURE_SCROLL_STOP') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (window.__zynkScrollTimer) {
              clearInterval(window.__zynkScrollTimer);
              window.__zynkScrollTimer = null;
            }
            window.__zynkScrollDir = null;
          }
        });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    // ---- All other gestures: forward to content.js message listener ----
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {}
    chrome.tabs.sendMessage(tab.id, p, (resp) => {
      sendResponse(resp || { ok: true });
    });

  })();

  return true;
});
