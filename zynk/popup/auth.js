// =============================================================================
// popup/auth.js
// Authentication: session check, token fetch, login / logout buttons.
// Depends on: ui.js (showLoading, showLoginUI, showUserUI, creditsLabel)
// =============================================================================

const API_BASE = 'https://localhost:8000';
const APP_URL  = 'https://localhost:3000';

// Check current session on popup open
async function checkAuth() {
  showLoading();
  try {
    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, { credentials: 'include' });
    if (resp.status !== 200) { showLoginUI(); return; }
    const json = await resp.json();
    if (!json.access_token) { showLoginUI(); return; }

    const userResp = await fetch(`${API_BASE}/user/me`, {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    if (!userResp.ok) { showLoginUI(); return; }

    const user = await userResp.json();
    showUserUI(user.name || user.email || user.user_id || 'User', user.credits);
  } catch (e) {
    showLoginUI();
  }
}

// Returns a fresh token for API calls, or null if session expired
async function fetchExtensionToken() {
  try {
    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, { credentials: 'include' });
    if (resp.status !== 200) return null;
    return (await resp.json()).access_token || null;
  } catch {
    return null;
  }
}

// -- Button listeners ---------------------------------------------------------

loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: APP_URL });
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {}
  showLoginUI();
});
