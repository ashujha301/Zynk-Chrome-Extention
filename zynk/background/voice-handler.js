// =============================================================================
// background/voice-handler.js
// Handles EXECUTE_COMMAND from the popup (voice transcription result).
// Calls the API to get an action plan, then executes it.
//
// Browser-level actions (back, forward, reload, tabs, zoom) are handled HERE
// because content scripts cannot access chrome.tabs / chrome.windows APIs.
//
// Depends on: auth.js (getStoredToken, fetchExtensionToken)
//             tabs.js (getRealTab, waitForTabLoad, delay)
//             executor.js (runActionPlan, executeStepInTab)
// =============================================================================

const BROWSER_ACTIONS = new Set([
  'browser_back', 'browser_forward', 'reload',
  'new_tab', 'close_tab', 'next_tab', 'prev_tab', 'zoom'
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'EXECUTE_COMMAND') return false;

  (async () => {
    // ---- Auth ---------------------------------------------------------------
    let token = getStoredToken();
    if (!token) {
      const ok = await fetchExtensionToken();
      if (!ok) { sendResponse({ error: 'Please login at https://localhost:3000' }); return; }
      token = getStoredToken();
    }

    // ---- Get action plan from backend ---------------------------------------
    const response = await fetch('https://localhost:8000/agent/execute', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ command: message.command })
    });

    if (response.status === 401) {
      _extensionToken = null;
      sendResponse({ error: 'Session expired. Login again.' });
      return;
    }

    const data = await response.json();
    sendResponse(data);

    if (!data.action_plan?.steps?.length) return;

    const tab = await getRealTab();
    if (!tab) { console.error('[Zynk] No usable tab.'); return; }

    // ---- Execute each step --------------------------------------------------
    await runVoicePlan(tab, data.action_plan.steps);
  })();

  return true;
});

// =============================================================================
// Run an action plan that may contain both content-script steps and
// browser-level steps (back/forward/reload/tabs/zoom).
// =============================================================================
async function runVoicePlan(tab, steps) {
  let tabId = tab.id;
  chrome.windows.update(tab.windowId, { focused: true });

  for (const step of steps) {
    console.log('[Zynk] Step:', JSON.stringify(step));

    // ---- navigate -----------------------------------------------------------
    if (step.action === 'navigate') {
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForTabLoad(tabId);
      await delay(1500);
      continue;
    }

    // ---- browser_back -------------------------------------------------------
    if (step.action === 'browser_back') {
      await chrome.tabs.goBack(tabId);
      await delay(800);
      continue;
    }

    // ---- browser_forward ----------------------------------------------------
    if (step.action === 'browser_forward') {
      await chrome.tabs.goForward(tabId);
      await delay(800);
      continue;
    }

    // ---- reload -------------------------------------------------------------
    if (step.action === 'reload') {
      await chrome.tabs.reload(tabId);
      await waitForTabLoad(tabId);
      await delay(800);
      continue;
    }

    // ---- new_tab ------------------------------------------------------------
    if (step.action === 'new_tab') {
      const created = await chrome.tabs.create({
        url:    step.url || 'chrome://newtab',
        active: true
      });
      tabId = created.id; // subsequent steps run in the new tab
      await delay(600);
      continue;
    }

    // ---- close_tab ----------------------------------------------------------
    if (step.action === 'close_tab') {
      await chrome.tabs.remove(tabId);
      // After closing, get the now-active tab for any remaining steps
      const newTab = await getRealTab();
      if (newTab) tabId = newTab.id;
      await delay(400);
      continue;
    }

    // ---- next_tab -----------------------------------------------------------
    if (step.action === 'next_tab') {
      const current = await chrome.tabs.get(tabId);
      const tabs    = await chrome.tabs.query({ windowId: current.windowId });
      const idx     = tabs.findIndex(t => t.id === tabId);
      const next    = tabs[(idx + 1) % tabs.length];
      await chrome.tabs.update(next.id, { active: true });
      tabId = next.id;
      await delay(400);
      continue;
    }

    // ---- prev_tab -----------------------------------------------------------
    if (step.action === 'prev_tab') {
      const current = await chrome.tabs.get(tabId);
      const tabs    = await chrome.tabs.query({ windowId: current.windowId });
      const idx     = tabs.findIndex(t => t.id === tabId);
      const prev    = tabs[(idx - 1 + tabs.length) % tabs.length];
      await chrome.tabs.update(prev.id, { active: true });
      tabId = prev.id;
      await delay(400);
      continue;
    }

    // ---- zoom ---------------------------------------------------------------
    if (step.action === 'zoom') {
      await chrome.tabs.setZoom(tabId, step.level ?? 1.0);
      await delay(200);
      continue;
    }

    // ---- All other steps run inside the page (content script) ---------------
    const result = await executeStepInTab(tabId, step);
    console.log('[Zynk] Result:', JSON.stringify(result));

    const pauseMs = step.action === 'type'     ? 300
                  : step.action === 'wait_for' ? 100
                  : 700;
    await delay(pauseMs);
  }

  console.log('[Zynk] Voice plan done.');
}