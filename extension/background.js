// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    });
  }
});

let accessToken = null;

// Always ask backend for a fresh short-lived token
async function getAccessToken() {
  const res = await fetch("https://localhost:8000/auth/ensure-extension-token", {
    method: "GET",
    credentials: "include"
  });

  if (res.status === 401) {
    return null;
  }

  const data = await res.json();
  accessToken = data.access_token;
  return accessToken;
}

async function executeCommand(command) {
  const token = await getAccessToken();

  if (!token) {
    chrome.tabs.create({ url: "http://localhost:3000" });
    return { error: "Please login first." };
  }

  const response = await fetch("https://localhost:8000/agent/execute", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ command })
  });

  if (response.status === 401) {
    chrome.tabs.create({ url: "http://localhost:3000" });
    return { error: "Session expired." };
  }

  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXECUTE_COMMAND") {
    executeCommand(message.command)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});