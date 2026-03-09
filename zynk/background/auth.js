// =============================================================================
// background/auth.js
// Auth helper for the service worker.
//
// With httpOnly cookies the background script no longer stores or reads the
// token — the browser attaches the ext_token cookie automatically on every
// credentialed request.  All we need to do is call ensure-extension-token so
// the backend sets / refreshes the cookie, then use credentials:'include' on
// every subsequent API call.
//
// getStoredToken() is GONE — tokens never touch JS memory.
// =============================================================================

const API_BASE = 'https://localhost:8000';

// Called once on service-worker startup and whenever a 401 is received.
// Asks the backend to validate the Clerk __session cookie and (re)set the
// httpOnly ext_token cookie.  Returns true on success, false on failure.
async function fetchExtensionToken() {
  try {
    const resp = await fetch(`${API_BASE}/auth/ensure-extension-token`, {
      credentials: 'include'   // sends __session (Clerk) cookie to backend
    });
    return resp.ok;            // backend sets ext_token cookie in the response
  } catch {
    return false;
  }
}

// Convenience wrapper: ensures a valid cookie exists before an API call.
// Returns true if ready, false if the user needs to log in.
async function ensureAuth() {
  return fetchExtensionToken();
}