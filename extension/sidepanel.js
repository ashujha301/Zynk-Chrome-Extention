const voiceBtn = document.getElementById("voiceBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

let mediaRecorder;
let audioChunks = [];

voiceBtn.addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      statusEl.textContent = "Transcribing...";

      const formData = new FormData();
      formData.append("file", audioBlob);

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
          (resp) => {
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
    };

    mediaRecorder.start();
    statusEl.textContent = "Recording...";
    voiceBtn.disabled = true;
    stopBtn.disabled = false;

  } catch (err) {
    statusEl.textContent = "Mic permission denied.";
  }
});

stopBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    voiceBtn.disabled = false;
    stopBtn.disabled = true;
  }
});