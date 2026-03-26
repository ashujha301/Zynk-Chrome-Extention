// =============================================================================
// content/main.js
// Entry point for content scripts.
// Guards against double-injection, then registers the message listener.
//
// CHANGE: Added GESTURE_HOVER handler that calls dispatchHover() from click.js
//         so YouTube controls / tooltips appear under the gesture cursor.
//
// Load order in manifest content_scripts or executeScript:
//   utils.js -> cursor.js -> scroll.js -> click.js -> clipboard.js -> executor.js -> main.js
// =============================================================================

if (!document.__zynkLoaded) {
  document.__zynkLoaded = true;

  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {

    // ---- Voice step execution -----------------------------------------------
    if (message.type === 'EXECUTE_STEP') {
      executeStep(message.step).then(sendResponse);
      return true;
    }

    // ---- Cursor move ---------------------------------------------------------
    if (message.type === 'GESTURE_CURSOR_MOVE') {
      var p = toViewport(message.nx, message.ny);
      moveCursor(p.x, p.y);
      sendResponse({ ok: true });
      return false;
    }

    // ---- Hover dispatch (YouTube controls / tooltips) -----------------------
    // Called every frame while the index finger is moving.
    // dispatchHover() is in click.js — it sends pointer + mouse events so that
    // YouTube's player controls become visible and tooltips trigger correctly.
    if (message.type === 'GESTURE_HOVER') {
      dispatchHover(message.nx, message.ny);
      sendResponse({ ok: true });
      return false;
    }

    // ---- Cursor hide ---------------------------------------------------------
    if (message.type === 'GESTURE_CURSOR_HIDE') {
      stopPageScroll();
      hideCursor();
      sendResponse({ ok: true });
      return false;
    }

    // ---- Scroll start --------------------------------------------------------
    if (message.type === 'GESTURE_SCROLL_START') {
      if (window.__zynkScrollDir === message.dir) { sendResponse({ ok: true }); return false; }
      stopPageScroll();
      window.__zynkScrollDir   = message.dir;
      window.__zynkScrollTimer = setInterval(function() {
        window.scrollBy({ top: message.dir === 'down' ? (message.px || 110) : -(message.px || 110), behavior: 'auto' });
      }, message.ms || 55);
      sendResponse({ ok: true });
      return false;
    }

    // ---- Scroll stop ---------------------------------------------------------
    if (message.type === 'GESTURE_SCROLL_STOP') {
      stopPageScroll();
      sendResponse({ ok: true });
      return false;
    }

    // ---- Pinch click ---------------------------------------------------------
    if (message.type === 'GESTURE_PINCH_CLICK') {
      handlePinchClick(message.nx, message.ny);
      sendResponse({ ok: true });
      return false;
    }

    // ---- Drag ---------------------------------------------------------------
    if (message.type === 'GESTURE_DRAG_START') {
      handleDragStart(message.nx, message.ny);
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'GESTURE_DRAG_MOVE') {
      handleDragMove(message.nx, message.ny);
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'GESTURE_DRAG_END') {
      handleDragEnd();
      sendResponse({ ok: true });
      return false;
    }

    // ---- Copy / Paste -------------------------------------------------------
    if (message.type === 'GESTURE_COPY') {
      handleCopy();
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === 'GESTURE_PASTE') {
      handlePaste();
      sendResponse({ ok: true });
      return false;
    }

  });
}