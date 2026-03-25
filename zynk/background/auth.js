// =============================================================================
// background/auth.js
// Auth helper for the service worker.
//
// The extension cannot rely on the browser attaching app.zynkai.xyz's
// __session cookie to requests made from chrome-extension:// origin.
// Instead, we read the Clerk __session cookie directly using chrome.cookies
// API (which CAN access it because we have host_permissions for app.zynkai.xyz),
// then pass it as Authorization: Bearer to the backend.
// The backend calls verify_clerk_token() on it and sets the httpOnly ext_token
// cookie scoped to .zynkai.xyz — which the extension CAN receive and send
// on subsequent requests because the requests go to api.zynkai.xyz.
// =============================================================================

const API_BASE = 'https://api.zynkai.xyz';

// Read the Clerk __session cookie from app.zynkai.xyz using the cookies API.
// Returns the token string or null.
async function getClerkSessionToken() {
  return new Promise((resolve) => {
    // Try primary app domain first
    chrome.cookies.get(
      { url: 'https://app.zynkai.xyz', name: '__session' },
      (cookie) => {
        if (cookie && cookie.value) {
          resolve(cookie.value);
          return;
        }
        // Fallback: try the Vercel preview URL
        chrome.cookies.get(
          { url: 'https://zynkai.vercel.app', name: '__session' },
          (cookie2) => {
            resolve(cookie2 ? cookie2.value : null);
          }
        );
      }
    );
  });
}

// Called before any API operation that needs auth.
// Reads the Clerk JWT and exchanges it for the httpOnly ext_token cookie.
// Returns true on success, false if the user needs to log in.
async function fetchExtensionToken() {
  try {
    const clerkToken = await getClerkSessionToken();

    if (!clerkToken) {
      console.log('[Zynk] No Clerk session cookie found. User needs to log in.');
      return false;
    }

    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      method: 'GET',
      credentials: 'include',   // so the response Set-Cookie is accepted
      headers: {
        'Authorization': `Bearer ${clerkToken}`
      }
    });

    if (!resp.ok) {
      console.log('[Zynk] ensure-extension-token failed:', resp.status);
      return false;
    }

    // Backend has now set the httpOnly ext_token cookie on .zynkai.xyz
    console.log('[Zynk] ext_token cookie set successfully.');
    return true;
  } catch (e) {
    console.error('[Zynk] fetchExtensionToken error:', e);
    return false;
  }
}

// Convenience wrapper
async function ensureAuth() {
  return fetchExtensionToken();
}