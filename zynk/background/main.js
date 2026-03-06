// Imports all background modules in dependency order.
// Listed in manifest.json as: "service_worker": "background/main.js"

importScripts(
  'window.js',          // popup + normal-window tracking
  'auth.js',            // token cache + fetchExtensionToken
  'tabs.js',            // getRealTab, isExecutableTab, waitForTabLoad, delay
  'executor.js',        // executeStepInTab, runActionPlan
  'voice-handler.js',   // EXECUTE_COMMAND listener
  'gesture-handler.js', // GESTURE_TO_TAB listener
  'tab-actions.js'      // TAB_ACTION + TAB_OVERLAY listeners
);

console.log('[Zynk] background ready.');
