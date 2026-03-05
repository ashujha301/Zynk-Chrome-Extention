let _extensionToken    = null;
let _extensionTokenExp = null;
let _popupWindowId     = null;   // track our popup so we don't open duplicates
let _lastNormalWindowId = null;  // track the last focused NORMAL window

// -- Track last focused normal window -----------------------------------------
// This is the window where execution will happen.
// We update it every time a NORMAL window gains focus.
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError) return;
    // Only track normal browser windows, never the popup
    if (win.type === "normal") {
      _lastNormalWindowId = windowId;
    }
  });
});

// -- Popup: open once, focus if already open -----------------------------------
chrome.action.onClicked.addListener(() => {
  // If our popup is still open, just focus it
  if (_popupWindowId !== null) {
    chrome.windows.get(_popupWindowId, (win) => {
      if (chrome.runtime.lastError || !win) {
        // Window was closed - open a new one
        _popupWindowId = null;
        openPopup();
      } else {
        chrome.windows.update(_popupWindowId, { focused: true });
      }
    });
  } else {
    openPopup();
  }
});

function openPopup() {
  chrome.windows.create({
    url: "voice.html",
    type: "popup",
    width: 420,
    height: 560
  }, (win) => {
    _popupWindowId = win.id;
  });
}

// Clean up when popup is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === _popupWindowId) {
    _popupWindowId = null;
  }
});

// -- Token Management ----------------------------------------------------------
function parseJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp;
  } catch { return null; }
}

function getStoredToken() {
  if (_extensionToken && _extensionTokenExp) {
    const now = Math.floor(Date.now() / 1000);
    if (now < _extensionTokenExp) return _extensionToken;
  }
  return null;
}

async function fetchExtensionToken() {
  const resp = await fetch("https://localhost:8000/auth/ensure-extension-token", {
    credentials: "include"
  });
  if (resp.status !== 200) return false;
  const json = await resp.json();
  if (!json.access_token) return false;
  _extensionToken    = json.access_token;
  _extensionTokenExp = parseJwtExp(json.access_token);
  return true;
}

// -- Get the real tab to execute in -------------------------------------------
// Priority:
//   1. Active tab in the last focused normal window  (most natural)
//   2. Active tab in any normal window
//   3. Create a new normal window
async function getRealTab() {
  // Try the last known normal window first
  if (_lastNormalWindowId !== null) {
    const tabs = await new Promise(resolve =>
      chrome.tabs.query({ active: true, windowId: _lastNormalWindowId }, resolve)
    );
    if (tabs && tabs.length > 0 && isExecutableTab(tabs[0])) {
      return tabs[0];
    }
  }

  // Fallback: any active tab in any normal window
  const allTabs = await new Promise(resolve =>
    chrome.tabs.query({ active: true, windowType: "normal" }, resolve)
  );

  for (const tab of (allTabs || [])) {
    if (isExecutableTab(tab)) return tab;
  }

  // No normal window exists - open one and return its tab
  const win  = await chrome.windows.create({ url: "about:blank", type: "normal" });
  _lastNormalWindowId = win.id;
  return win.tabs[0];
}

// Chrome blocks scripting on chrome://, chrome-extension://, and the NTP
function isExecutableTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;
  if (url.startsWith("chrome://"))           return false;
  if (url.startsWith("chrome-extension://")) return false;
  if (url.startsWith("devtools://"))         return false;
  return true;
}

// -- Wait for tab to finish loading -------------------------------------------
function waitForTabLoad(tabId, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };

    const onUpdated = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === "complete") finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -- Inject content.js + run one step -----------------------------------------
async function executeStepInTab(tabId, step) {
  // Re-inject content.js - safe to call multiple times (idempotent)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {
    console.warn("[Zynk] inject warning:", e.message);
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "EXECUTE_STEP", step }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[Zynk] sendMessage error:", chrome.runtime.lastError.message);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: true });
      }
    });
  });
}

// -- Run all steps sequentially ------------------------------------------------
async function runActionPlan(tab, steps) {
  let tabId     = tab.id;
  let windowId  = tab.windowId;

  // Bring the target window to front so the user can watch it happen
  chrome.windows.update(windowId, { focused: true });

  for (const step of steps) {
    console.log("[Zynk] Step:", JSON.stringify(step));

    if (step.action === "navigate") {
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForTabLoad(tabId);
      // Extra settle time - YouTube/Amazon are SPAs that hydrate after load
      await delay(1800);
      console.log("[Zynk] Navigated to:", step.url);
      continue;
    }

    const result = await executeStepInTab(tabId, step);
    console.log("[Zynk] Result:", JSON.stringify(result));

    // Adaptive delay: typing is fast, clicks/waits need settle time
    const pauseMs = step.action === "type"     ? 300
                  : step.action === "wait_for" ? 100
                  : 900;
    await delay(pauseMs);
  }

  console.log("[Zynk] Done.");
}

// -- Message Handler -----------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_COMMAND") {
    (async () => {
      let token = getStoredToken();

      if (!token) {
        const ok = await fetchExtensionToken();
        if (!ok) {
          sendResponse({ error: "Please login at https://localhost:3000" });
          return;
        }
        token = getStoredToken();
      }

      const response = await fetch("https://localhost:8000/agent/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ command: message.command })
      });

      const data = await response.json();

      if (response.status === 401) {
        _extensionToken = null;
        sendResponse({ error: "Session expired. Login again." });
        return;
      }

      sendResponse(data);

      if (data.action_plan?.steps?.length) {
        const tab = await getRealTab();
        if (!tab) {
          console.error("[Zynk] Could not find a usable tab.");
          return;
        }
        console.log("[Zynk] Executing on tab:", tab.id, "|", tab.url, "| window:", tab.windowId);
        await runActionPlan(tab, data.action_plan.steps);
      }
    })();

    return true;
  }
});

console.log("Zynk background loaded.");


// =============================================================================
// GESTURE MESSAGE HANDLER
// All gesture messages from voice.js arrive as GESTURE_TO_TAB.
// Payload is forwarded to content.js in the real active tab.
//
// CURSOR MOVE: high-frequency, injected directly via executeScript
//   for minimum latency (skips sendMessage round-trip).
// SCROLL START/STOP: single message, content.js runs interval in-page.
// CLICK/DRAG/COPY/PASTE: normal sendMessage.
//
// CHROME NATIVE UI (tabs bar, address bar):
//   Content scripts cannot reach Chrome's native UI - that is a hard
//   browser security boundary. We handle tab-bar actions (new tab,
//   switch tab, go back/forward, focus address bar) directly here in
//   background via chrome.tabs / chrome.windows APIs.
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type !== 'GESTURE_TO_TAB') return false;

  const payload = message.payload;

  (async () => {
    const tab = await getRealTab();
    if (!tab) { sendResponse({ ok: false }); return; }

    // -- CURSOR MOVE: use executeScript for lowest latency --
    // Bypasses the content.js message listener entirely.
    if (payload.type === 'GESTURE_CURSOR_MOVE') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (nx, ny) => {
            var c = document.getElementById('__zynk_cursor');
            if (!c) return;
            var W = window.innerWidth;
            var H = window.innerHeight;
            c.style.display = 'block';
            c.style.left    = Math.round(nx * W) + 'px';
            c.style.top     = Math.round(ny * H) + 'px';
          },
          args: [payload.nx, payload.ny]
        });
      } catch(e) {
        // Page not injectable (chrome:// etc) - ignore
      }
      sendResponse({ ok: true });
      return;
    }

    // -- CURSOR HIDE --
    if (payload.type === 'GESTURE_CURSOR_HIDE') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            var c = document.getElementById('__zynk_cursor');
            if (c) c.style.display = 'none';
            // Also stop any running scroll
            if (window.__zynkScrollTimer) {
              clearInterval(window.__zynkScrollTimer);
              window.__zynkScrollTimer = null;
            }
          }
        });
      } catch(e) {}
      sendResponse({ ok: true });
      return;
    }

    // -- SCROLL START: inject interval directly into page --
    if (payload.type === 'GESTURE_SCROLL_START') {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (dir, px, ms) => {
            if (window.__zynkScrollDir === dir) return; // already going
            if (window.__zynkScrollTimer) clearInterval(window.__zynkScrollTimer);
            window.__zynkScrollDir   = dir;
            window.__zynkScrollTimer = setInterval(function() {
              window.scrollBy({ top: dir === 'down' ? px : -px, behavior: 'auto' });
            }, ms);
          },
          args: [payload.dir, payload.px || 110, payload.ms || 55]
        });
      } catch(e) {}
      sendResponse({ ok: true });
      return;
    }

    // -- SCROLL STOP --
    if (payload.type === 'GESTURE_SCROLL_STOP') {
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
      } catch(e) {}
      sendResponse({ ok: true });
      return;
    }

    // -- All other gesture messages: forward to content.js --
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch(e) {}
    chrome.tabs.sendMessage(tab.id, payload, (resp) => {
      sendResponse(resp || { ok: true });
    });

  })();

  return true; // keep channel open for async sendResponse
});

console.log('Zynk background loaded.');

// =============================================================================
// TAB ACTION HANDLER
// Handles: get_tabs, switch_tab, new_tab
// Called from voice.js gesture pipeline via chrome.runtime.sendMessage
// =============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ---- get list of all open tabs in current window ----
  if (message.type === 'TAB_ACTION' && message.action === 'get_tabs') {
    (async () => {
      const tab    = await getRealTab();
      const wid    = tab ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
      const tabs   = await chrome.tabs.query({ windowId: wid });
      const active = tabs.findIndex(t => t.active);
      sendResponse({
        tabs: tabs.map((t, i) => ({
          id:    t.id,
          title: t.title || 'Tab ' + (i + 1),
          url:   t.url   || '',
          index: i
        })),
        activeIndex: active >= 0 ? active : 0
      });
    })();
    return true;
  }

  // ---- switch to a tab by id ----
  if (message.type === 'TAB_ACTION' && message.action === 'switch_tab') {
    chrome.tabs.update(message.tabId, { active: true }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ---- open new tab to the right of the current tab ----
  if (message.type === 'TAB_ACTION' && message.action === 'new_tab') {
    (async () => {
      const tab = await getRealTab();
      await chrome.tabs.create({
        windowId: tab ? tab.windowId : undefined,
        index:    tab ? tab.index + 1 : undefined,
        active:   true
      });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ---- tab overlay: inject / update / remove UI in active tab ----
  if (message.type === 'TAB_OVERLAY') {
    (async () => {
      const tab = await getRealTab();
      if (!tab) { sendResponse({ ok: false }); return; }

      if (message.action === 'show' || message.action === 'update') {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (tabs, activeIdx) => {

            // Remove and recreate overlay every time for clean update
            var old = document.getElementById('__zynk_tab_overlay');
            if (old) old.remove();

            var ov = document.createElement('div');
            ov.id = '__zynk_tab_overlay';
            Object.assign(ov.style, {
              position:        'fixed',
              bottom:          '0',
              left:            '0',
              right:           '0',
              zIndex:          '2147483645',
              display:         'flex',
              flexDirection:   'column',
              alignItems:      'center',
              gap:             '0',
              pointerEvents:   'none',
              fontFamily:      'monospace',
              background:      'linear-gradient(to top, rgba(5,5,15,0.97) 0%, rgba(5,5,15,0.85) 80%, transparent 100%)',
              paddingBottom:   '20px',
              paddingTop:      '20px',
            });

            // Instruction bar
            var hint = document.createElement('div');
            Object.assign(hint.style, {
              color:         'rgba(124,106,255,0.8)',
              fontSize:      '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom:  '12px',
              fontWeight:    '700',
            });
            hint.textContent = 'Close fist + move left / right  --  Open hand to select  --  Point finger to cancel';
            ov.appendChild(hint);

            // Tab pills row
            var row = document.createElement('div');
            Object.assign(row.style, {
              display:         'flex',
              gap:             '10px',
              alignItems:      'flex-end',
              justifyContent:  'center',
              flexWrap:        'nowrap',
              overflowX:       'hidden',
              maxWidth:        '95vw',
              paddingBottom:   '4px',
            });

            // Only show a window of tabs around the active one (max 7 visible)
            var total   = tabs.length;
            var half    = 3;
            var start   = Math.max(0, activeIdx - half);
            var end     = Math.min(total - 1, activeIdx + half);
            // Ensure we always show 7 if possible
            if (end - start < 6) {
              if (start === 0) end   = Math.min(total - 1, start + 6);
              else              start = Math.max(0, end - 6);
            }

            for (var i = start; i <= end; i++) {
              var t        = tabs[i];
              var isActive = (i === activeIdx);
              var pill     = document.createElement('div');

              var title = (t.title || ('Tab ' + (i + 1)));
              if (title.length > 18) title = title.substring(0, 16) + '..';

              Object.assign(pill.style, {
                background:    isActive ? '#7c6aff'              : 'rgba(20,20,35,0.95)',
                color:         isActive ? '#fff'                  : '#888',
                border:        isActive ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(124,106,255,0.2)',
                borderRadius:  '10px',
                padding:       isActive ? '10px 16px'            : '7px 12px',
                fontSize:      isActive ? '12px'                 : '10px',
                fontWeight:    isActive ? '700'                  : '400',
                minWidth:      '80px',
                maxWidth:      '150px',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                whiteSpace:    'nowrap',
                textAlign:     'center',
                transition:    'all 0.12s ease',
                boxShadow:     isActive ? '0 0 20px rgba(124,106,255,0.5)' : 'none',
                flexShrink:    '0',
              });

              // Tab number badge + title
              var num = document.createElement('div');
              Object.assign(num.style, {
                fontSize:    '8px',
                opacity:     '0.6',
                marginBottom:'2px',
                letterSpacing:'0.05em',
              });
              num.textContent = (i + 1) + ' / ' + total;

              var ttl = document.createElement('div');
              ttl.textContent = title;

              pill.appendChild(num);
              pill.appendChild(ttl);
              row.appendChild(pill);
            }

            // Edge indicators if more tabs exist
            if (start > 0) {
              var lind = document.createElement('div');
              Object.assign(lind.style, { color: '#555', fontSize:'11px', alignSelf:'center' });
              lind.textContent = '< ' + start + ' more';
              row.insertBefore(lind, row.firstChild);
            }
            if (end < total - 1) {
              var rind = document.createElement('div');
              Object.assign(rind.style, { color: '#555', fontSize:'11px', alignSelf:'center' });
              rind.textContent = (total - 1 - end) + ' more >';
              row.appendChild(rind);
            }

            ov.appendChild(row);
            document.documentElement.appendChild(ov);
          },
          args: [message.tabs || [], message.activeIdx || 0]
        });

      } else if (message.action === 'hide') {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            var ov = document.getElementById('__zynk_tab_overlay');
            if (ov) ov.remove();
          }
        });
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

});