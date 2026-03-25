// =============================================================================
// popup/auth.js
// Checks auth state when popup opens and handles login/logout.
//
// Flow:
//   1. Try to read Clerk __session cookie from app.zynkai.xyz via chrome.cookies
//   2. If found, call /auth/ensure-extension-token with Bearer token
//      → backend sets httpOnly ext_token cookie on .zynkai.xyz
//   3. Call /user/me with credentials:'include'
//      → browser sends ext_token cookie automatically
//   4. Show user UI or login UI
// =============================================================================

const API_BASE = 'https://api.zynkai.xyz';
const APP_URL  = 'https://app.zynkai.xyz';

// Read Clerk __session cookie from the web app domain.
// This works because the extension has host_permissions for app.zynkai.xyz.
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

// Exchanges Clerk JWT for httpOnly ext_token cookie.
// Returns true on success.
async function fetchExtensionToken() {
  try {
    const clerkToken = await getClerkSessionToken();
    if (!clerkToken) return false;

    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${clerkToken}` }
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// Check auth on popup open
async function checkAuth() {
  showLoading();
  try {
    // Step 1: Exchange Clerk token for our httpOnly cookie
    const tokenOk = await fetchExtensionToken();
    if (!tokenOk) {
      showLoginUI();
      return;
    }

    // Step 2: Fetch user info — ext_token cookie is sent automatically
    const userResp = await fetch(`${API_BASE}/user/me`, {
      credentials: 'include'
    });
    if (!userResp.ok) {
      showLoginUI();
      return;
    }

    const user = await userResp.json();
    showUserUI(
      user['Name'] || user.display_name || user.email || user.user_id || 'User',
      user['Credits remaining'] ?? user.credits
    );
  } catch (e) {
    console.error('[Zynk] checkAuth error:', e);
    showLoginUI();
  }
}

// -- Button listeners ---------------------------------------------------------

loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: APP_URL });
  // After user logs in, clicking the extension icon again will trigger checkAuth
  // which will find the __session cookie and exchange it.
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method:      'POST',
      credentials: 'include'
    });
  } catch {}
  showLoginUI();
});