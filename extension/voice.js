const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

let mediaRecorder;
let audioChunks = [];
let streamRef;

function parseJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp;
  } catch {
    return null;
  }
}

async function fetchExtensionToken() {
  const resp = await fetch(
    "https://localhost:8000/auth/ensure-extension-token",
    { credentials: "include" }
  );

  if (resp.status !== 200) return null;

  const json = await resp.json();
  return json.access_token || null;
}

startBtn.addEventListener("click", async () => {
  try {
    statusEl.textContent = "Requesting microphone...";

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });

      const token = await fetchExtensionToken();
      if (!token) {
        statusEl.textContent = "Please login at https://localhost:3000";
        cleanup();
        return;
      }

      statusEl.textContent = "Transcribing voice...";

      const formData = new FormData();
      formData.append("file", blob);

      try {

        const response = await fetch(
          "https://localhost:8000/agent/transcribe",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`
            },
            body: formData,
            credentials: "include"
          }
        );

        const data = await response.json();

        if (!data.text) {
          statusEl.textContent = "Speech not recognized.";
          cleanup();
          return;
        }

        const command = data.text;

        statusEl.textContent = "Command: " + command;

        // Send command to background
        chrome.runtime.sendMessage(
          {
            type: "EXECUTE_COMMAND",
            command: command
          },
          (resp) => {

            if (resp?.error) {
              statusEl.textContent = "Error: " + resp.error;
              return;
            }

            statusEl.textContent = "Executed: " + command;
          }
        );

      } catch (err) {
        statusEl.textContent = "Transcription failed.";
      }

      cleanup();
    };

    mediaRecorder.start();

    startBtn.disabled = true;
    stopBtn.disabled = false;

    statusEl.textContent = "Recording...";

  } catch (err) {
    statusEl.textContent = "Mic error: " + err.name;
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
});

function cleanup() {
  if (streamRef) {
    streamRef.getTracks().forEach(track => track.stop());
    streamRef = null;
  }
}