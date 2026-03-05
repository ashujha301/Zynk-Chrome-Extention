// =============================================================================
// popup/voice.js
// Wake-word detection ("Hey Zynk") + audio recording + transcription.
// Depends on: ui.js (voiceStatus, recordingRing, creditsLabel, showLoginUI)
//             auth.js (fetchExtensionToken, API_BASE)
// =============================================================================

// -- State --------------------------------------------------------------------
let mediaRecorder         = null;
let audioChunks           = [];
let streamRef             = null;
let recognition           = null;
let isRecording           = false;
let accumulatedTranscript = '';

// =============================================================================
// Wake-word listener   starts SpeechRecognition on the mic stream.
// Runs continuously until stopListening() is called.
// =============================================================================
async function startListening() {
  if (recognition) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = 'en-US';

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result     = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) accumulatedTranscript += transcript;

        const full = (accumulatedTranscript + (result.isFinal ? '' : transcript)).toLowerCase();
        voiceStatus.textContent = 'Heard: "' + transcript.trim() + '"';

        if ((full.includes('hey zynk') || full.includes('hey zing') || full.includes('hey zinc') || full.includes('haising') || full.includes('haasing') || full.includes('haizing')) && !isRecording) {
          accumulatedTranscript = '';
          startRecording();
        }
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') voiceStatus.textContent = 'Mic error: ' + e.error;
    };

    recognition.onend = () => {
      if (!isRecording && recognition) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.start();
    voiceStatus.textContent = 'Listening for Hey Zynk...';
    recordingRing.className = 'listening';

  } catch (e) {
    voiceStatus.textContent = 'Mic error: ' + e.message;
  }
}

function stopListening() {
  isRecording = false;
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
    recognition = null;
  }
  if (streamRef) {
    streamRef.getTracks().forEach(t => t.stop());
    streamRef = null;
  }
  accumulatedTranscript = '';
}

// =============================================================================
// Recording   triggered after wake word.
// Records 4s of audio, transcribes, sends command to background.
// =============================================================================
function startRecording() {
  if (!streamRef) return;
  isRecording = true;
  audioChunks = [];

  // Pause wake-word detection while recording
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
  }

  mediaRecorder = new MediaRecorder(streamRef);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    isRecording             = false;
    recordingRing.className = 'listening';

    // Resume wake-word detection
    if (recognition) {
      recognition.onend = () => {
        if (!isRecording && recognition) try { recognition.start(); } catch {}
      };
      try { recognition.start(); } catch {}
    }

    const token = await fetchExtensionToken();
    if (!token) {
      voiceStatus.textContent = 'Session expired.';
      showLoginUI();
      return;
    }

    voiceStatus.textContent = 'Transcribing...';
    const formData = new FormData();
    formData.append('file', new Blob(audioChunks, { type: 'audio/webm' }));

    try {
      const resp = await fetch(`${API_BASE}/agent/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        credentials: 'include'
      });
      const data = await resp.json();
      if (!data.text) { voiceStatus.textContent = 'Could not understand.'; return; }

      const command = data.text;
      voiceStatus.textContent = 'Command: "' + command + '"';

      chrome.runtime.sendMessage({ type: 'EXECUTE_COMMAND', command }, (response) => {
        if (response?.error) {
          voiceStatus.textContent = 'Error: ' + response.error;
          const msg = response.error.toLowerCase();
          if (msg.includes('login') || msg.includes('expired')) showLoginUI();
          return;
        }
        if (response?.credits_remaining !== undefined) {
          creditsLabel.textContent = response.credits_remaining + ' cr';
        }
        voiceStatus.textContent = 'OK Done: "' + command + '"';
        setTimeout(() => { voiceStatus.textContent = 'Listening for Hey Zynk...'; }, 3000);
      });

    } catch (e) {
      voiceStatus.textContent = 'Transcription failed.';
    }
  };

  mediaRecorder.start();
  recordingRing.className = 'recording';
  voiceStatus.textContent = 'Recording... (speak your command)';

  // Auto-stop after 4 seconds
  setTimeout(() => {
    if (isRecording && mediaRecorder?.state === 'recording') mediaRecorder.stop();
  }, 5000);
}
