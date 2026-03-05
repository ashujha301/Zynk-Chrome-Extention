// =============================================================================
// background/voice-handler.js
// Handles EXECUTE_COMMAND from the popup (voice transcription result).
// Calls the API, then runs the returned action plan in the active tab.
// Depends on: auth.js, tabs.js, executor.js
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'EXECUTE_COMMAND') return false;

  (async () => {
    let token = getStoredToken();
    if (!token) {
      const ok = await fetchExtensionToken();
      if (!ok) { sendResponse({ error: 'Please login at https://localhost:3000' }); return; }
      token = getStoredToken();
    }

    const response = await fetch('https://localhost:8000/agent/execute', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ command: message.command })
    });

    const data = await response.json();

    if (response.status === 401) {
      _extensionToken = null;
      sendResponse({ error: 'Session expired. Login again.' });
      return;
    }

    sendResponse(data);

    if (data.action_plan?.steps?.length) {
      const tab = await getRealTab();
      if (!tab) { console.error('[Zynk] No usable tab.'); return; }
      await runActionPlan(tab, data.action_plan.steps);
    }
  })();

  return true; // keep message channel open for async sendResponse
});
