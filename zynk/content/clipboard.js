// =============================================================================
// content/clipboard.js
// Copy / paste via execCommand and a brief toast overlay.
// =============================================================================

function handleCopy() {
  document.execCommand('copy');
  flashToast('Copied');
}

function handlePaste() {
  document.execCommand('paste');
  flashToast('Pasted');
}

function flashToast(text) {
  var toast = document.getElementById('__zynk_toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '__zynk_toast';
    Object.assign(toast.style, {
      position:      'fixed',
      bottom:        '24px',
      left:          '50%',
      transform:     'translateX(-50%)',
      background:    'rgba(10,10,15,0.92)',
      color:         '#fff',
      padding:       '7px 18px',
      borderRadius:  '16px',
      fontFamily:    'monospace',
      fontSize:      '12px',
      fontWeight:    '700',
      zIndex:        '2147483646',
      pointerEvents: 'none',
      border:        '1px solid rgba(124,106,255,0.4)',
      opacity:       '0',
      transition:    'opacity 0.2s ease',
    });
    document.documentElement.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toast.__zynkT);
  toast.__zynkT = setTimeout(function() { toast.style.opacity = '0'; }, 1200);
}
