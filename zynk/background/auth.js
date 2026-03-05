// =============================================================================
// background/auth.js
// JWT token caching and refresh for API calls from the service worker.
// Depends on: nothing (standalone)
// =============================================================================

let _extensionToken    = null;
let _extensionTokenExp = null;

function parseJwtExp(token) {
  try {
    return JSON.parse(atob(token.split('.')[1])).exp;
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
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', {
      credentials: 'include'
    });
    if (resp.status !== 200) return false;
    const json = await resp.json();
    if (!json.access_token) return false;
    _extensionToken    = json.access_token;
    _extensionTokenExp = parseJwtExp(json.access_token);
    return true;
  } catch { return false; }
}
