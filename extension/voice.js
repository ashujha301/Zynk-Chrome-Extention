// ZYNK AI - voice.js  (Voice + Gesture Control)

// -- DOM refs ------------------------------------------------------------------
const statusPill      = document.getElementById('statusPill');
const statusDot       = document.getElementById('statusDot');
const statusPillText  = document.getElementById('statusPillText');
const loadingCard     = document.getElementById('loadingCard');
const userCard        = document.getElementById('userCard');
const loginCard       = document.getElementById('loginCard');
const userAvatar      = document.getElementById('userAvatar');
const userNameEl      = document.getElementById('userName');
const creditsLabel    = document.getElementById('creditsLabel');
const voiceStatus     = document.getElementById('voiceStatus');
const recordingRing   = document.getElementById('recordingRing');
const loginBtn        = document.getElementById('loginBtn');
const logoutBtn       = document.getElementById('logoutBtn');
const gestureToggleBtn = document.getElementById('gestureToggleBtn');
const gesturePanel     = document.getElementById('gesturePanel');
const camVideo         = document.getElementById('camVideo');
const camCanvas        = document.getElementById('camCanvas');
const camCtx           = camCanvas.getContext('2d');
const gestureLabel     = document.getElementById('gestureLabel');
const gesturePill      = document.getElementById('gesturePill');
const camStartBtn      = document.getElementById('camStartBtn');
const camStopBtn       = document.getElementById('camStopBtn');


// VOICE STATE

let mediaRecorder;
let audioChunks           = [];
let streamRef             = null;
let recognition           = null;
let isRecording           = false;
let accumulatedTranscript = '';


// GESTURE STATE

let camStream     = null;
let handsModel    = null;
let animFrameId   = null;
let gestureActive = false;
let panelOpen     = false;

// Pinch tracking
let isPinching          = false;
let pinchStartX         = 0;
let pinchStartY         = 0;
let pinchDragActive     = false;

// Swipe tracking (two-finger)
let swipeHistory        = [];   // [{y, time}, ...]
const SWIPE_HISTORY_MS  = 350;

// Gesture debounce
let lastGesture         = null;
let lastGestureTime     = 0;
const GESTURE_COOLDOWN  = 900;   // ms between same gesture firing

// One-finger cursor: track if cursor is being shown
let cursorVisible = false;


// ------------------------------------ UI HELPERS ------------------------------------------

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
  stopCamera();
}
function showUserUI(name, credits) {
  loadingCard.style.display = 'none';
  loginCard.style.display   = 'none';
  userCard.style.display    = 'flex';
  userAvatar.textContent     = (name || 'U')[0].toUpperCase();
  userNameEl.textContent     = name || 'User';
  creditsLabel.textContent   = `${credits ?? '-'} cr`;
  statusPill.className       = 'status-pill active';
  statusPillText.textContent = 'Active';
  statusDot.classList.add('pulse');
  startListening();
}


// ------------------------------------ AUTH ------------------------------------------

async function checkAuth() {
  showLoading();
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', { credentials: 'include' });
    if (resp.status !== 200) { showLoginUI(); return; }
    const json = await resp.json();
    if (!json.access_token) { showLoginUI(); return; }
    const userResp = await fetch('https://localhost:8000/user/me', {
      headers: { Authorization: `Bearer ${json.access_token}` }
    });
    if (!userResp.ok) { showLoginUI(); return; }
    const user = await userResp.json();
    showUserUI(user.name || user.email || user.user_id || 'User', user.credits);
  } catch (e) { showLoginUI(); }
}

async function fetchExtensionToken() {
  try {
    const resp = await fetch('https://localhost:8000/auth/ensure-extension-token', { credentials: 'include' });
    if (resp.status !== 200) return null;
    return (await resp.json()).access_token || null;
  } catch { return null; }
}

loginBtn.addEventListener('click', () => chrome.tabs.create({ url: 'https://localhost:3000' }));
logoutBtn.addEventListener('click', async () => {
  try { await fetch('https://localhost:8000/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
  showLoginUI();
});


// ------------------------------------ VOICE - Wake-word recognition loop ------------------------------------

async function startListening() {
  if (recognition) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef = stream;
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous     = true;
    recognition.interimResults = true;
    recognition.lang           = 'en-US';
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) accumulatedTranscript += transcript;
        const full = (accumulatedTranscript + (result.isFinal ? '' : transcript)).toLowerCase();
        voiceStatus.textContent = `Heard: "${transcript.trim()}"`;
        if ((full.includes('hey zynk') || full.includes('hey zinc') || full.includes('haizing') || full.includes('haising') || full.includes('haazing')) && !isRecording) {
          accumulatedTranscript = '';
          startRecording();
        }
      }
    };
    recognition.onerror = (e) => { if (e.error !== 'aborted') voiceStatus.textContent = 'Mic error: ' + e.error; };
    recognition.onend   = () => { if (!isRecording && recognition) try { recognition.start(); } catch {} };
    recognition.start();
    voiceStatus.textContent = 'Listening for "Hey Zynk"...';
    recordingRing.className = 'listening';
  } catch (e) {
    voiceStatus.textContent = 'Mic error: ' + e.message;
  }
}

function stopListening() {
  isRecording = false;
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} recognition = null; }
  if (streamRef)   { streamRef.getTracks().forEach(t => t.stop()); streamRef = null; }
  accumulatedTranscript = '';
}


// ------------------------------------ VOICE - Recording (after wake word) ------------------------------------

function startRecording() {
  if (!streamRef) return;
  isRecording = true;
  audioChunks = [];
  if (recognition) { recognition.onend = null; try { recognition.stop(); } catch {} }
  mediaRecorder = new MediaRecorder(streamRef);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    isRecording = false;
    recordingRing.className = 'listening';
    if (recognition) {
      recognition.onend = () => { if (!isRecording && recognition) try { recognition.start(); } catch {} };
      try { recognition.start(); } catch {}
    }
    const token = await fetchExtensionToken();
    if (!token) { voiceStatus.textContent = 'Session expired.'; showLoginUI(); return; }
    voiceStatus.textContent = 'Transcribing...';
    const formData = new FormData();
    formData.append('file', new Blob(audioChunks, { type: 'audio/webm' }));
    try {
      const resp = await fetch('https://localhost:8000/agent/transcribe', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
        body: formData, credentials: 'include'
      });
      const data = await resp.json();
      if (!data.text) { voiceStatus.textContent = 'Could not understand.'; return; }
      const command = data.text;
      voiceStatus.textContent = `Command: "${command}"`;
      chrome.runtime.sendMessage({ type: 'EXECUTE_COMMAND', command }, (response) => {
        if (response?.error) {
          voiceStatus.textContent = 'Error: ' + response.error;
          if (response.error.toLowerCase().includes('login') || response.error.toLowerCase().includes('expired')) showLoginUI();
          return;
        }
        if (response?.credits_remaining !== undefined) creditsLabel.textContent = `${response.credits_remaining} cr`;
        voiceStatus.textContent = `OK Done: "${command}"`;
        setTimeout(() => { voiceStatus.textContent = 'Listening for "Hey Zynk"...'; }, 3000);
      });
    } catch (e) { voiceStatus.textContent = 'Transcription failed.'; }
  };
  mediaRecorder.start();
  recordingRing.className = 'recording';
  voiceStatus.textContent = 'Recording... (speak your command)';
  setTimeout(() => { if (isRecording && mediaRecorder?.state === 'recording') mediaRecorder.stop(); }, 4000);
}


// ------------------------------------ GESTURE PANEL - toggle ------------------------------------

gestureToggleBtn.addEventListener('click', () => {
  panelOpen = !panelOpen;
  gesturePanel.classList.toggle('open', panelOpen);
  gestureToggleBtn.classList.toggle('active', panelOpen);
  const label = gestureToggleBtn.querySelector('.btn-label');
  if (label) label.textContent = panelOpen ? 'Disable Camera' : 'Enable Camera';
});

camStartBtn.addEventListener('click', startCamera);
camStopBtn.addEventListener('click',  stopCamera);


// CAMERA - start / stop

async function startCamera() {
  if (gestureActive) return;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' }
    });
    camVideo.srcObject = camStream;
    await new Promise(r => { camVideo.onloadedmetadata = r; });
    camCanvas.width  = camVideo.videoWidth;
    camCanvas.height = camVideo.videoHeight;
    gestureActive        = true;
    camStartBtn.disabled = true;
    camStopBtn.disabled  = false;
    gesturePill.textContent = 'ACTIVE';
    await initHandLandmarker();
    renderLoop();
  } catch (e) {
    gestureLabel.textContent = 'Camera error: ' + e.message;
    console.error('[Zynk] Camera error:', e);
  }
}

function stopCamera() {
  gestureActive = false;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  if (camStream)   { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  camVideo.srcObject = null;
  camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);
  gestureLabel.textContent = 'Camera off';
  gesturePill.textContent  = 'READY';
  gesturePill.classList.remove('triggered');
  camStartBtn.disabled = false;
  camStopBtn.disabled  = true;
  sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
}


// MEDIAPIPE TASKS VISION - Hand Landmarker
// This is the MODERN MediaPipe API (not the old @0.4 legacy).
// Uses wasm-unsafe-eval (allowed in MV3 via manifest CSP).
// Files needed in mediapipe/ folder:
//   - vision_bundle.js          (the main library)
//   - hand_landmarker.task      (the model ~8MB)

async function initHandLandmarker() {
  if (handsModel) return;
  gestureLabel.textContent = 'Loading hand model...';

  try {
    const { HandLandmarker, FilesetResolver } = await import(
      chrome.runtime.getURL('mediapipe/vision_bundle.mjs')
    );

    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('mediapipe/wasm')   // folder with wasm files
    );

    handsModel = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('mediapipe/hand_landmarker.task'),
        delegate: 'GPU'   // uses WebGL - no WASM streaming, very fast
      },
      runningMode:        'VIDEO',
      numHands:           1,
      minHandDetectionConfidence: 0.7,
      minHandPresenceConfidence:  0.7,
      minTrackingConfidence:      0.6
    });

    gestureLabel.textContent = 'Show your hand ';
  } catch (e) {
    console.error('[Zynk] HandLandmarker init failed:', e);
    gestureLabel.textContent = 'Model load failed - see console';
    handsModel    = null;
    gestureActive = false;
    camStartBtn.disabled = false;
    camStopBtn.disabled  = true;
  }
}


// ------------------------------------ RENDER LOOP ------------------------------------

let lastVideoTime = -1;

function renderLoop() {
  if (!gestureActive) return;
  animFrameId = requestAnimationFrame(() => {
    if (handsModel && camVideo.readyState >= 2) {
      const nowMs = performance.now();
      // Tasks Vision requires detectForVideo - only process new frames
      if (camVideo.currentTime !== lastVideoTime) {
        lastVideoTime = camVideo.currentTime;
        const results = handsModel.detectForVideo(camVideo, nowMs);
        onHandResults(results);
      }
    }
    renderLoop();
  });
}


// ------------------------------------ HAND CONNECTIONS - skeleton drawing ------------------------------------

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17]
];


// PROCESS RESULTS - Tasks Vision format
// results.landmarks[0] = array of 21 {x,y,z} already normalised 0..1

function onHandResults(results) {
  camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);

  if (!results.landmarks || results.landmarks.length === 0) {
    gestureLabel.textContent = 'No hand detected';
    if (cursorVisible) { cursorVisible = false; sendToTab({ type: 'GESTURE_CURSOR_HIDE' }); }
    if (isPinching)    { isPinching = false; pinchDragActive = false; sendToTab({ type: 'GESTURE_DRAG_END' }); }
    return;
  }

  // landmarks[0] = first hand, already normalised {x,y,z} 0..1
  const lm = results.landmarks[0];
  drawSkeleton(lm);
  processFrame(lm);
}


// DRAW SKELETON

function drawSkeleton(lm) {
  const W = camCanvas.width, H = camCanvas.height;
  camCtx.strokeStyle = 'rgba(124,106,255,0.65)';
  camCtx.lineWidth   = 2;
  for (const [a, b] of CONNECTIONS) {
    camCtx.beginPath();
    camCtx.moveTo(lm[a].x * W, lm[a].y * H);
    camCtx.lineTo(lm[b].x * W, lm[b].y * H);
    camCtx.stroke();
  }
  for (const p of lm) {
    camCtx.beginPath();
    camCtx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
    camCtx.fillStyle = '#7c6aff';
    camCtx.fill();
  }
  for (const i of [4, 8, 12, 16, 20]) {
    camCtx.beginPath();
    camCtx.arc(lm[i].x * W, lm[i].y * H, 5, 0, Math.PI * 2);
    camCtx.fillStyle = 'rgba(255,255,255,0.9)';
    camCtx.fill();
  }
}


// LANDMARK HELPERS

function dist(a, b)     { return Math.hypot(a.x - b.x, a.y - b.y); }
function isUp(lm, t, m) { return lm[t].y < lm[m].y - 0.03; }

function fingerStates(lm) {
  return {
    index:  isUp(lm, 8,  5),
    middle: isUp(lm, 12, 9),
    ring:   isUp(lm, 16, 13),
    pinky:  isUp(lm, 20, 17),
    thumb:  lm[4].y < lm[3].y && lm[4].y < lm[2].y
  };
}

function getPinchDist(lm)      { return dist(lm[4], lm[8]); }
function indexTipScreenPos(lm) { return { x: 1 - lm[8].x, y: lm[8].y }; }


// ------------------------------------ PER-FRAME GESTURE PIPELINE ------------------------------------

function processFrame(lm) {
  const f     = fingerStates(lm);
  const pinch = getPinchDist(lm) < 0.07;
  const pos   = indexTipScreenPos(lm);

  const onlyIndex  = f.index && !f.middle && !f.ring && !f.pinky;
  const twoFingers = f.index && f.middle  && !f.ring && !f.pinky;
  const fist       = !f.index && !f.middle && !f.ring && !f.pinky && !f.thumb;
  const thumbsUp   = f.thumb && !f.index  && !f.middle && !f.ring && !f.pinky;

  // 1. ONE FINGER -> cursor
  if (onlyIndex && !pinch) {
    cursorVisible = true;
    sendToTab({ type: 'GESTURE_CURSOR_MOVE', nx: pos.x, ny: pos.y });
    gestureLabel.textContent = 'POINTING';
    return;
  } else if (cursorVisible && !onlyIndex) {
    cursorVisible = false;
    sendToTab({ type: 'GESTURE_CURSOR_HIDE' });
  }

  // 2. PINCH -> click or drag
  if (pinch) {
    if (!isPinching) {
      isPinching = true; pinchStartX = pos.x; pinchStartY = pos.y; pinchDragActive = false;
    } else {
      const dx = Math.abs(pos.x - pinchStartX);
      const dy = Math.abs(pos.y - pinchStartY);
      if (!pinchDragActive && (dx > 0.04 || dy > 0.04)) {
        pinchDragActive = true;
        sendToTab({ type: 'GESTURE_DRAG_START', nx: pinchStartX, ny: pinchStartY });
        gestureLabel.textContent = 'DRAG SELECT';
      }
      if (pinchDragActive) sendToTab({ type: 'GESTURE_DRAG_MOVE', nx: pos.x, ny: pos.y });
    }
    return;
  } else if (isPinching) {
    if (pinchDragActive) {
      sendToTab({ type: 'GESTURE_DRAG_END' });
      gestureLabel.textContent = 'SELECT DONE';
    } else {
      debounce('PINCH_CLICK', () => {
        sendToTab({ type: 'GESTURE_PINCH_CLICK', nx: pos.x, ny: pos.y });
        showGestureFeedback('CLICK');
      });
    }
    isPinching = false; pinchDragActive = false;
  }

  // 3. TWO FINGERS -> swipe scroll
  if (twoFingers) {
    const midY = (lm[8].y + lm[12].y) / 2;
    const now  = Date.now();
    swipeHistory.push({ y: midY, time: now });
    swipeHistory = swipeHistory.filter(p => now - p.time < SWIPE_HISTORY_MS);
    if (swipeHistory.length >= 4) {
      const delta = swipeHistory[swipeHistory.length - 1].y - swipeHistory[0].y;
      if (delta > 0.06) {
        debounce('SWIPE_UP', () => { sendToTab({ type: 'EXECUTE_STEP', step: { action: 'scroll', direction: 'up', amount: 350 } }); showGestureFeedback('SCROLL UP'); }, 300);
        swipeHistory = [];
      } else if (delta < -0.06) {
        debounce('SWIPE_DOWN', () => { sendToTab({ type: 'EXECUTE_STEP', step: { action: 'scroll', direction: 'down', amount: 350 } }); showGestureFeedback('SCROLL DOWN'); }, 300);
        swipeHistory = [];
      }
    }
    gestureLabel.textContent = 'SWIPE TO SCROLL';
    return;
  } else { swipeHistory = []; }

  // 4. FIST -> copy
  if (fist) {
    debounce('FIST', () => { sendToTab({ type: 'GESTURE_COPY' }); showGestureFeedback('COPY'); });
    gestureLabel.textContent = 'COPY';
    return;
  }

  // 5. THUMBS UP -> paste
  if (thumbsUp) {
    debounce('THUMBS_UP', () => { sendToTab({ type: 'GESTURE_PASTE' }); showGestureFeedback('PASTE'); });
    gestureLabel.textContent = 'PASTE';
    return;
  }

  gestureLabel.textContent = 'Hand detected';
}


// ------------------------------------ HELPERS ------------------------------------

const _debounceTimes = {};
function debounce(key, fn, cooldown = GESTURE_COOLDOWN) {
  const now = Date.now();
  if (now - (_debounceTimes[key] || 0) < cooldown) return;
  _debounceTimes[key] = now;
  fn();
}

function showGestureFeedback(label) {
  gesturePill.textContent = label;
  gesturePill.classList.add('triggered');
  setTimeout(() => { gesturePill.classList.remove('triggered'); gesturePill.textContent = 'ACTIVE'; }, 800);
}

function sendToTab(msg) {
  chrome.runtime.sendMessage({ type: 'GESTURE_TO_TAB', payload: msg });
}

// BOOT
window.onload = checkAuth;