// =============================================================================
// background/executor.js
// Injects content.js into a tab and runs multi-step action plans.
// Depends on: tabs.js (waitForTabLoad, delay)
// =============================================================================

// Inject content.js (idempotent) then send one step
async function executeStepInTab(tabId, step) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (e) {
    console.warn('[Zynk] inject warning:', e.message);
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_STEP', step }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { ok: true });
      }
    });
  });
}

// Run a full action plan sequentially
async function runActionPlan(tab, steps) {
  const tabId = tab.id;
  chrome.windows.update(tab.windowId, { focused: true });

  for (const step of steps) {
    console.log('[Zynk] Step:', JSON.stringify(step));

    if (step.action === 'navigate') {
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForTabLoad(tabId);
      await delay(1800); // SPA hydration settle time
      continue;
    }

    const result = await executeStepInTab(tabId, step);
    console.log('[Zynk] Result:', JSON.stringify(result));

    const pauseMs = step.action === 'type'     ? 300
                  : step.action === 'wait_for' ? 100
                  : 900;
    await delay(pauseMs);
  }
  console.log('[Zynk] Done.');
}
