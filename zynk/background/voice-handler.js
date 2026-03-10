// =============================================================================
// background/voice-handler.js
// Handles EXECUTE_COMMAND from popup. Calls backend with credentials:include.
// The ext_token httpOnly cookie is attached by the browser automatically —
// no JS token handling, no Authorization header.
//
// Depends on: auth.js (fetchExtensionToken, API_BASE)
//             tabs.js (getRealTab, waitForTabLoad, delay)
//             executor.js (executeStepInTab)
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'EXECUTE_COMMAND') return false;

  (async () => {
    // Refresh / set the ext_token cookie before calling the API
    const authed = await fetchExtensionToken();
    if (!authed) {
      sendResponse({ error: 'Please login at https://localhost:3000' });
      return;
    }

    // Get current page URL for better selector accuracy in the LLM
    let current_url = null;
    try {
      const tab = await getRealTab();
      if (tab?.url && !tab.url.startsWith('chrome://')) current_url = tab.url;
    } catch {}

    let response;
    try {
      response = await fetch(`${API_BASE}/agent/execute`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ command: message.command, current_url })
      });
    } catch (e) {
      sendResponse({ error: 'Network error: ' + e.message });
      return;
    }

    if (response.status === 401) {
      sendResponse({ error: 'Session expired. Login again.' });
      return;
    }

    const data = await response.json();
    sendResponse(data);

    if (!data.action_plan?.steps?.length) return;

    const tab = await getRealTab();
    if (!tab) { console.error('[Zynk] No usable tab.'); return; }

    await runVoicePlan(tab, data.action_plan.steps);
  })();

  return true;
});

async function runVoicePlan(tab, steps) {
  let tabId = tab.id;
  chrome.windows.update(tab.windowId, { focused: true });

  for (const step of steps) {
    console.log('[Zynk] Step:', JSON.stringify(step));

    if (step.action === 'navigate') {
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForTabLoad(tabId);
      await delay(1500);
      continue;
    }
    if (step.action === 'browser_back')    { await chrome.tabs.goBack(tabId);    await delay(800); continue; }
    if (step.action === 'browser_forward') { await chrome.tabs.goForward(tabId); await delay(800); continue; }
    if (step.action === 'reload')          { await chrome.tabs.reload(tabId); await waitForTabLoad(tabId); await delay(800); continue; }

    if (step.action === 'new_tab') {
      const created = await chrome.tabs.create({ url: step.url || 'chrome://newtab', active: true });
      tabId = created.id;
      await delay(600);
      continue;
    }
    if (step.action === 'close_tab') {
      await chrome.tabs.remove(tabId);
      const newTab = await getRealTab();
      if (newTab) tabId = newTab.id;
      await delay(400);
      continue;
    }
    if (step.action === 'next_tab') {
      const current = await chrome.tabs.get(tabId);
      const tabs = await chrome.tabs.query({ windowId: current.windowId });
      const next = tabs[(tabs.findIndex(t => t.id === tabId) + 1) % tabs.length];
      await chrome.tabs.update(next.id, { active: true });
      tabId = next.id;
      await delay(400);
      continue;
    }
    if (step.action === 'prev_tab') {
      const current = await chrome.tabs.get(tabId);
      const tabs = await chrome.tabs.query({ windowId: current.windowId });
      const idx = tabs.findIndex(t => t.id === tabId);
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      await chrome.tabs.update(prev.id, { active: true });
      tabId = prev.id;
      await delay(400);
      continue;
    }
    if (step.action === 'zoom') {
      await chrome.tabs.setZoom(tabId, step.level ?? 1.0);
      await delay(200);
      continue;
    }

    const result = await executeStepInTab(tabId, step);
    console.log('[Zynk] Result:', JSON.stringify(result));
    await delay(step.action === 'type' ? 300 : step.action === 'wait_for' ? 100 : 700);
  }
  console.log('[Zynk] Voice plan done.');
}