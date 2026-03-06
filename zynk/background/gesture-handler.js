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

    // ---- CURSOR MOVE: GPU-composited via transform (zero trace) ----
    // Calls moveCursor() from content/cursor.js which uses transform:translate().
    // transform is composited by the GPU - position updates atomically with no
    // layout pass, so the cursor never renders at an old position (no trace).
    if (p.type === 'GESTURE_CURSOR_MOVE') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (nx, ny) => {
            var x = Math.round(nx * window.innerWidth);
            var y = Math.round(ny * window.innerHeight);
            if (typeof moveCursor === 'function') {
              moveCursor(x, y); // content/cursor.js - uses transform
            } else {
              // Fallback if content script not yet loaded
              var c = document.getElementById('__zynk_cursor');
              if (c) {
                c.style.display   = 'block';
                c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
              }
            }
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
            if (typeof hideCursor === 'function') {
              hideCursor(); // content/cursor.js
            } else {
              var c = document.getElementById('__zynk_cursor');
              if (c) {
                c.style.display   = 'none';
                c.style.transform = 'translate(-9999px,-9999px)';
              }
            }
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
    // Inject all content scripts in order (idempotent - __zynkLoaded guard inside)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'content/utils.js',
          'content/cursor.js',
          'content/scroll.js',
          'content/click.js',
          'content/clipboard.js',
          'content/executor.js',
          'content/main.js'
        ]
      });
    } catch {}
    chrome.tabs.sendMessage(tab.id, p, (resp) => {
      sendResponse(resp || { ok: true });
    });

  })();

  return true;
});