//DOM refs ---------------------------------
const statusPill     = document.getElementById('statusPill');
const statusDot      = document.getElementById('statusDot');
const statusPillText = document.getElementById('statusPillText');
const loadingCard    = document.getElementById('loadingCard');
const userCard       = document.getElementById('userCard');
const loginCard      = document.getElementById('loginCard');
const userAvatar     = document.getElementById('userAvatar');
const userNameEl     = document.getElementById('userName');
const creditsLabel   = document.getElementById('creditsLabel');
const voiceStatus    = document.getElementById('voiceStatus');
const recordingRing  = document.getElementById('recordingRing');
const loginBtn       = document.getElementById('loginBtn');
const logoutBtn      = document.getElementById('logoutBtn');

//State ---------------------------------
let mediaRecorder;
let audioChunks           = [];
let streamRef             = null;
let recognition           = null;
let isRecording           = false;
let accumulatedTranscript = '';

//UI helpers ---------------------------------
function showLoading() {
  loadingCard.style.display = 'flex';
  userCard.style.display    = 'none';
  loginCard.style.display   = 'none';
}

function showLoginUI() {
  loadingCard.style.display = 'none';
  userCard.style.display    = 'none';
  loginCard.style.display   = 'flex';

  statusPill.className       = 'status-pill inactive';
  statusPillText.textContent = 'Offline';
  statusDot.classList.remove('pulse');

  stopListening();
}

function showUserUI(name, credits) {
  loadingCard.style.display = 'none';
  loginCard.style.display   = 'none';
  userCard.style.display    = 'flex';

  const initial          = (name || 'U')[0].toUpperCase();
  userAvatar.textContent  = initial;
  // userNameEl.textContent  = name || 'User';
  creditsLabel.textContent = `${credits ?? '-'} credits`;

  statusPill.className       = 'status-pill active';
  statusPillText.textContent = 'Active';
  statusDot.classList.add('pulse');

  startListening();
}

//Auth helpers ------------------------------------------------------------------
async function checkAuth() {
  showLoading();
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', {
      credentials: 'include'
    });

    if (resp.status !== 200) { showLoginUI(); return; }

    const json = await resp.json();
    if (!json.access_token) { showLoginUI(); return; }

    // Fetch user profile
    const userResp = await fetch('https://localhost:8000/user/me', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });

    if (!userResp.ok) { showLoginUI(); return; }

    const user        = await userResp.json();
    const displayName = user.name || user.email || user.user_id || 'User';
    showUserUI(displayName, user.credits);

  } catch (err) {
    console.error('Auth check failed:', err);
    showLoginUI();
  }
}

async function fetchExtensionToken() {
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', {
      credentials: 'include'
    });
    if (resp.status !== 200) return null;
    const json = await resp.json();
    return json.access_token || null;
  } catch {
    return null;
  }
}

//Button handlers -----------------------------------------------------------------
loginBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://localhost:3000' });
});

logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('https://localhost:8000/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch { /* ignore */ }
  showLoginUI();
});

// Voice: Recognition (wake-word loop)------------------------------------------

async function startListening() {
  if (recognition) return; // already running

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef    = stream;

    recognition                = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = 'en-US';

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result     = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) accumulatedTranscript += transcript;

        const full  = (accumulatedTranscript + (result.isFinal ? '' : transcript)).toLowerCase();
        voiceStatus.textContent = `Heard: "${transcript.trim()}"`;

        if ((full.includes('hey zynk') || full.includes('hey zinc') || full.includes('hey zink') || full.includes('haising') ) && !isRecording) {
          console.log('Wake word detected');
          accumulatedTranscript = '';
          startRecording();
        }
      }
    };

    recognition.onerror = (event) => {
      // "aborted" is expected when we manually stop recognition before recording
      if (event.error === 'aborted') return;
      console.warn('Recognition error:', event.error);
      voiceStatus.textContent = 'Mic error: ' + event.error;
    };

    // FIX: Only restart recognition itself, not the whole startListening()
    recognition.onend = () => {
      if (!isRecording && recognition) {
        try { recognition.start(); } catch {  }
      }
    };

    recognition.start();
    voiceStatus.textContent = 'Listening for "Hey Zynk"...';
    recordingRing.className = 'listening';

  } catch (err) {
    console.error('Mic error:', err);
    voiceStatus.textContent = 'Mic error: ' + err.message;
  }
}

function stopListening() {
  isRecording = false;
  if (recognition) {
    recognition.onend = null; // prevent auto-restart
    try { recognition.stop(); } catch { }
    recognition = null;
  }
  if (streamRef) {
    streamRef.getTracks().forEach(t => t.stop());
    streamRef = null;
  }
  accumulatedTranscript = '';
}

//Voice: Recording ------------------------------------------------------
function startRecording() {
  if (!streamRef) return;

  isRecording = true;
  audioChunks = [];

  // Pause recognition while recording so it doesn't steal the mic
  if (recognition) {
    recognition.onend = null; // suppress auto-restart during recording
    try { recognition.stop(); } catch { /* ignore */ }
  }

  mediaRecorder = new MediaRecorder(streamRef);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    isRecording             = false;
    recordingRing.className = 'listening';

    // Re-wire recognition auto-restart and resume listening
    if (recognition) {
      recognition.onend = () => {
        if (!isRecording && recognition) {
          try { recognition.start(); } catch { /* ignore */ }
        }
      };
      try { recognition.start(); } catch { /* ignore */ }
    }

    const token = await fetchExtensionToken();
    if (!token) {
      voiceStatus.textContent = 'Session expired - please log in again.';
      showLoginUI();
      return;
    }

    voiceStatus.textContent = 'Transcribing...';

    const blob     = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('file', blob);

    try {
      const resp = await fetch('https://localhost:8000/agent/transcribe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        credentials: 'include'
      });

      const data = await resp.json();

      if (!data.text) {
        voiceStatus.textContent = 'Could not understand. Try again...';
        return;
      }

      const command = data.text;
      voiceStatus.textContent = `Command: "${command}"`;

      chrome.runtime.sendMessage({ type: 'EXECUTE_COMMAND', command }, (response) => {
        if (response?.error) {
          voiceStatus.textContent = 'Error: ' + response.error;
          if (response.error.toLowerCase().includes('login') || response.error.toLowerCase().includes('expired')) {
            showLoginUI();
          }
          return;
        }

        if (response?.credits_remaining !== undefined) {
          creditsLabel.textContent = `${response.credits_remaining} credits`;
        }

        voiceStatus.textContent = `Done: "${command}"`;
        setTimeout(() => {
          voiceStatus.textContent = 'Listening for "Hey Zynk"...';
        }, 3000);
      });

    } catch (err) {
      console.error('Transcription failed:', err);
      voiceStatus.textContent = 'Transcription failed.';
    }
  };

  mediaRecorder.start();
  recordingRing.className = 'recording';
  voiceStatus.textContent = 'Recording... (speak your command)';

  // Auto-stop after 5s - was 2s which was too short for real commands
  setTimeout(() => {
    if (isRecording && mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
    }
  }, 5000);
}

//Boot ---------------------------------
window.onload = checkAuth;