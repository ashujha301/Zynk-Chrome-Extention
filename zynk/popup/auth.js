// =============================================================================
// popup/auth.js
// Auth state check + login/logout for the popup.
//
// FIX: After the user clicks "Open Login Page", we start polling for the
//      Clerk __session cookie. The moment it appears (user logged in on the
//      web app tab), we auto-call checkAuth() so the popup shows "logged in"
//      without needing to be closed and reopened.
// =============================================================================

const API_BASE = 'https://api.zynkai.xyz';
const APP_URL  = 'https://app.zynkai.xyz';

let _loginPollTimer = null;   // setInterval handle for post-login polling

// -- Read Clerk __session cookie from web app domain -------------------------
async function getClerkSessionToken() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: 'https://app.zynkai.xyz', name: '__session' },
      (cookie) => {
        if (cookie && cookie.value) { resolve(cookie.value); return; }
        // Fallback: Vercel preview
        chrome.cookies.get(
          { url: 'https://zynkai.vercel.app', name: '__session' },
          (cookie2) => resolve(cookie2 ? cookie2.value : null)
        );
      }
    );
  });
}

// -- Exchange Clerk JWT for httpOnly ext_token cookie -----------------------
async function fetchExtensionToken() {
  try {
    const clerkToken = await getClerkSessionToken();
    if (!clerkToken) return false;

    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      method:      'GET',
      credentials: 'include',
      headers:     { 'Authorization': `Bearer ${clerkToken}` }
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// -- Main auth check called on popup open -----------------------------------
async function checkAuth() {
  showLoading();
  try {
    const tokenOk = await fetchExtensionToken();
    if (!tokenOk) {
      showLoginUI();
      return;
    }

    const userResp = await fetch(`${API_BASE}/user/me`, {
      credentials: 'include'
    });
    if (!userResp.ok) {
      showLoginUI();
      return;
    }

    const user = await userResp.json();
    // Stop any polling — we're logged in
    _stopLoginPoll();
    showUserUI(
      user['Name'] || user.display_name || user.email || user.user_id || 'User',
      user['Credits remaining'] ?? user.credits
    );
  } catch (e) {
    console.error('[Zynk] checkAuth error:', e);
    showLoginUI();
  }
}

// -- Login poll: re-check auth every 2s after login page is opened ----------
// Stops as soon as auth succeeds or popup is closed.
function _startLoginPoll() {
  if (_loginPollTimer) return;   // already polling
  _loginPollTimer = setInterval(async () => {
    // Check if the cookie has appeared yet (fast check — no network call)
    const token = await getClerkSessionToken();
    if (token) {
      // Cookie found — do the full auth check which will update the UI
      await checkAuth();
      // If checkAuth succeeded it calls _stopLoginPoll() via showUserUI path.
      // If it failed (e.g. network) we keep polling.
    }
  }, 2000);  // check every 2 seconds
}

function _stopLoginPoll() {
  if (_loginPollTimer) {
    clearInterval(_loginPollTimer);
    _loginPollTimer = null;
  }
}

// -- Button listeners --------------------------------------------------------

loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: APP_URL });
  // Start polling so the popup auto-updates when user logs in
  _startLoginPoll();
});

logoutBtn.addEventListener('click', async () => {
  _stopLoginPoll();
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method:      'POST',
      credentials: 'include'
    });
  } catch {}
  showLoginUI();
});