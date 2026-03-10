const API_BASE = 'https://localhost:8000';
const APP_URL  = 'https://localhost:3000';

// Check session on popup open
async function checkAuth() {
  showLoading();
  try {
    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      credentials: 'include'
    });
    if (!resp.ok) { showLoginUI(); return; }

    // Fetch user info — backend reads ext_token cookie automatically
    const userResp = await fetch(`${API_BASE}/user/me`, {
      credentials: 'include'    // no Authorization header needed
    });
    if (!userResp.ok) { showLoginUI(); return; }

    const user = await userResp.json();
    showUserUI(user.display_name || user.email || user.user_id || 'User', user.credits);
  } catch (e) {
    showLoginUI();
  }
}

// Refreshes the ext_token cookie. Returns true on success.
// Called before any API operation that needs auth.
async function fetchExtensionToken() {
  try {
    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      credentials: 'include'
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// -- Button listeners ---------------------------------------------------------

loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: APP_URL });
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method:      'POST',
      credentials: 'include'   // backend clears the cookie server-side
    });
  } catch {}
  showLoginUI();
});