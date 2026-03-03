const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

let mediaRecorder;
let audioChunks = [];
let streamRef;

startBtn.addEventListener("click", async () => {
  try {
    statusEl.textContent = "Requesting microphone...";

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: "audio/webm" });

      statusEl.textContent = "Transcribing...";

      const formData = new FormData();
      formData.append("file", blob);

      const response = await fetch(
        "https://localhost:8000/agent/transcribe",
        {
          method: "POST",
          body: formData,
          credentials: "include"
        }
      );

      const data = await response.json();

      if (data.text) {
        statusEl.textContent = "Heard: " + data.text;

        chrome.runtime.sendMessage(
          { type: "EXECUTE_COMMAND", command: data.text },
          resp => {
            if (resp?.error) {
              statusEl.textContent = "Error: " + resp.error;
            } else {
              statusEl.textContent = "Command executed.";
            }
          }
        );
      } else {
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