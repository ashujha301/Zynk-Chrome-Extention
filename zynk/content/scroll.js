// =============================================================================
// content/scroll.js
// Runs continuous scroll inside the page via setInterval.
// Background injects the scroll start/stop via executeScript   these
// window globals (__zynkScrollTimer, __zynkScrollDir) are set directly
// by background/gesture-handler.js for zero-latency scroll.
// This file just provides the stop helper used by the message listener.
// =============================================================================

function stopPageScroll() {
  if (window.__zynkScrollTimer) {
    clearInterval(window.__zynkScrollTimer);
    window.__zynkScrollTimer = null;
  }
  window.__zynkScrollDir = null;
}
