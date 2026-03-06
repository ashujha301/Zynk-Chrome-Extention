// =============================================================================
// background/tab-actions.js
// Handles TAB_ACTION (get_tabs, switch_tab, new_tab) and
// TAB_OVERLAY (show/update/hide the tab picker UI in the active tab).
// Depends on: tabs.js (getRealTab)
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ---- Get all tabs in the current window ----------------------------------
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

  // ---- Switch to a tab by id -----------------------------------------------
  if (message.type === 'TAB_ACTION' && message.action === 'switch_tab') {
    chrome.tabs.update(message.tabId, { active: true }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  // ---- Open new tab to the right of current --------------------------------
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

  // ---- Cycle to next tab in same window (yo gesture) ----------------------
  if (message.type === 'TAB_ACTION' && message.action === 'next_tab') {
    (async () => {
      const tab  = await getRealTab();
      const wid  = tab ? tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
      const tabs = await chrome.tabs.query({ windowId: wid });
      if (!tabs || tabs.length === 0) { sendResponse({ ok: false }); return; }
      const currentIdx = tabs.findIndex(t => t.active);
      const nextIdx    = (currentIdx + 1) % tabs.length; // wrap around
      await chrome.tabs.update(tabs[nextIdx].id, { active: true });
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ---- Browser back (like clicking the Back button) -----------------------
  if (message.type === 'TAB_ACTION' && message.action === 'nav_back') {
    (async () => {
      const tab = await getRealTab();
      if (tab) await chrome.tabs.goBack(tab.id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ---- Browser forward (like clicking the Forward button) ------------------
  if (message.type === 'TAB_ACTION' && message.action === 'nav_forward') {
    (async () => {
      const tab = await getRealTab();
      if (tab) await chrome.tabs.goForward(tab.id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // ---- Tab overlay: inject / update / remove pill UI ----------------------
  if (message.type === 'TAB_OVERLAY') {
    (async () => {
      const tab = await getRealTab();
      if (!tab) { sendResponse({ ok: false }); return; }

      if (message.action === 'show' || message.action === 'update') {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (tabs, activeIdx) => {
            var old = document.getElementById('__zynk_tab_overlay');
            if (old) old.remove();

            var ov = document.createElement('div');
            ov.id  = '__zynk_tab_overlay';
            Object.assign(ov.style, {
              position:      'fixed',
              bottom:        '0', left: '0', right: '0',
              zIndex:        '2147483645',
              display:       'flex',
              flexDirection: 'column',
              alignItems:    'center',
              pointerEvents: 'none',
              fontFamily:    'monospace',
              background:    'linear-gradient(to top, rgba(5,5,15,0.97) 0%, rgba(5,5,15,0.85) 80%, transparent 100%)',
              padding:       '20px 0',
            });

            // Instruction hint
            var hint = document.createElement('div');
            Object.assign(hint.style, {
              color: 'rgba(124,106,255,0.8)', fontSize: '10px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: '12px', fontWeight: '700',
            });
            hint.textContent = 'Slide palm left / right to switch  --  Close fist = open tab';
            ov.appendChild(hint);

            // Tab pills row (windowed: max 7 around active)
            var total = tabs.length;
            var start = Math.max(0, activeIdx - 3);
            var end   = Math.min(total - 1, activeIdx + 3);
            if (end - start < 6) {
              if (start === 0) end   = Math.min(total - 1, 6);
              else              start = Math.max(0, end - 6);
            }

            var row = document.createElement('div');
            Object.assign(row.style, {
              display: 'flex', gap: '10px',
              alignItems: 'flex-end', justifyContent: 'center',
              flexWrap: 'nowrap', maxWidth: '95vw',
            });

            if (start > 0) {
              var li = document.createElement('div');
              Object.assign(li.style, { color: '#555', fontSize: '11px', alignSelf: 'center' });
              li.textContent = '< ' + start + ' more';
              row.appendChild(li);
            }

            for (var i = start; i <= end; i++) {
              var t      = tabs[i];
              var active = (i === activeIdx);
              var pill   = document.createElement('div');
              var title  = (t.title || ('Tab ' + (i + 1)));
              if (title.length > 18) title = title.substring(0, 16) + '..';

              Object.assign(pill.style, {
                background:   active ? '#7c6aff'                       : 'rgba(20,20,35,0.95)',
                color:        active ? '#fff'                           : '#888',
                border:       active ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(124,106,255,0.2)',
                borderRadius: '10px',
                padding:      active ? '10px 16px' : '7px 12px',
                fontSize:     active ? '12px' : '10px',
                fontWeight:   active ? '700'  : '400',
                minWidth: '80px', maxWidth: '150px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textAlign: 'center', flexShrink: '0',
                boxShadow: active ? '0 0 20px rgba(124,106,255,0.5)' : 'none',
                transition: 'all 0.12s ease',
              });

              var num = document.createElement('div');
              Object.assign(num.style, { fontSize: '8px', opacity: '0.6', marginBottom: '2px' });
              num.textContent = (i + 1) + ' / ' + total;

              var ttl = document.createElement('div');
              ttl.textContent = title;

              pill.appendChild(num);
              pill.appendChild(ttl);
              row.appendChild(pill);
            }

            if (end < total - 1) {
              var ri = document.createElement('div');
              Object.assign(ri.style, { color: '#555', fontSize: '11px', alignSelf: 'center' });
              ri.textContent = (total - 1 - end) + ' more >';
              row.appendChild(ri);
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