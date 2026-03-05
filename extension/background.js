let _extensionToken = null;
let _extensionTokenExp = null;

// Open floating voice window when extension icon clicked
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: "voice.html",
    type: "popup",
    width: 420,
    height: 420
  });
});


// --------------------------------------TOKEN MANAGEMENT-------------------------------------------------

function parseJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp;
  } catch {
    return null;
  }
}

function getStoredToken() {
  if (_extensionToken && _extensionTokenExp) {
    const now = Math.floor(Date.now() / 1000);
    if (now < _extensionTokenExp) return _extensionToken;
  }
  return null;
}

async function fetchExtensionToken() {
  const resp = await fetch(
    "https://localhost:8000/auth/ensure-extension-token",
    { credentials: "include" }
  );

  if (resp.status !== 200) return false;

  const json = await resp.json();
  if (!json.access_token) return false;

  _extensionToken = json.access_token;
  _extensionTokenExp = parseJwtExp(json.access_token);
  return true;
}

//------------------------------------- MESSAGE HANDLER--------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_COMMAND") {
    (async () => {
      let token = getStoredToken();

      if (!token) {
        const ok = await fetchExtensionToken();
        if (!ok) {
          sendResponse({ error: "Please login at https://localhost:3000" });
          return;
        }
        token = getStoredToken();
      }

      const response = await fetch(
        "https://localhost:8000/agent/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ command: message.command })
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        _extensionToken = null;
        sendResponse({ error: "Session expired. Login again." });
        return;
      }

      sendResponse(data);

      // execute steps in active tab
      if (data.action_plan?.steps) {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });

        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            { type: "EXECUTE_STEPS", steps: data.action_plan.steps }
          );
        }
      }
    })();

    return true;
  }
});

console.log("Zynk background loaded.");