let _extensionToken    = null;
let _extensionTokenExp = null;
let _popupWindowId     = null;   // track our popup so we don't open duplicates
let _lastNormalWindowId = null;  // track the last focused NORMAL window

// ── Track last focused normal window ─────────────────────────────────────────
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

// ── Popup: open once, focus if already open ───────────────────────────────────
chrome.action.onClicked.addListener(() => {
  // If our popup is still open, just focus it
  if (_popupWindowId !== null) {
    chrome.windows.get(_popupWindowId, (win) => {
      if (chrome.runtime.lastError || !win) {
        // Window was closed — open a new one
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

// ── Token Management ──────────────────────────────────────────────────────────
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

// ── Get the real tab to execute in ───────────────────────────────────────────
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

  // No normal window exists — open one and return its tab
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

// ── Wait for tab to finish loading ───────────────────────────────────────────
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

// ── Inject content.js + run one step ─────────────────────────────────────────
async function executeStepInTab(tabId, step) {
  // Re-inject content.js — safe to call multiple times (idempotent)
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

// ── Run all steps sequentially ────────────────────────────────────────────────
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
      // Extra settle time — YouTube/Amazon are SPAs that hydrate after load
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

// ── Message Handler ───────────────────────────────────────────────────────────
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